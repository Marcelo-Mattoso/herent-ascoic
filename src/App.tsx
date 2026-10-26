import { type ReactNode, useEffect, useState } from "react";
import { exportJournalJson } from "@/core/journal/gameJournal";
import { Defeat } from "@/ui/screens/Defeat";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Replay } from "@/ui/screens/Replay";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { useGameStore } from "@/ui/store/gameStore";
import { publicAssetUrl } from "@/ui/publicAssetUrl";
import { TutorialHub } from "@/ui/tutorials/TutorialHub";
import { TutorialOverlay } from "@/ui/tutorials/TutorialOverlay";
import type { TutorialAuditSnapshot } from "@/ui/tutorials/audit";
import {
	getTutorialModule,
	TUTORIAL_MODULES,
	type TutorialModuleId,
} from "@/ui/tutorials/registry";
import {
	backTutorialObservation,
	continueTutorial,
	currentTutorialStep,
	finishTutorial,
	reconcileTutorial,
	selectTutorialHeroes,
	skipTutorialObservation,
	startTutorial,
	type TutorialSession,
} from "@/ui/tutorials/session";

type UiScreen = "menu" | "setup" | "tutorialHub";

function App() {
	const { view, journal, dispatch, reset } = useGameStore();
	const status = view.status;
	const [uiScreen, setUiScreen] = useState<UiScreen>("menu");
	const [tutorial, setTutorial] = useState<TutorialSession | null>(null);
	const [lastTutorialAudit, setLastTutorialAudit] =
		useState<TutorialAuditSnapshot | null>(null);
	const [showReplay, setShowReplay] = useState(false);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key === "R") {
				e.preventDefault();
				setShowReplay((v) => !v);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		setTutorial((current) =>
			current ? reconcileTutorial(current, view) : current,
		);
	}, [view]);

	function startModule(id: TutorialModuleId) {
		const module = getTutorialModule(id);
		const entry = module.entry;
		const selectedHeroCardIds =
			tutorial?.selectedHeroCardIds ??
			lastTutorialAudit?.session.selectedHeroCardIds ??
			[];
		if (entry.kind === "setup") {
			reset();
			setTutorial(startTutorial(id));
			setUiScreen("setup");
			return;
		}
		const context = { view, selectedHeroCardIds };
		if (!entry.canReuseBoard?.(context)) {
			if (!entry.prepareActions)
				throw new Error(`Arquivo sem preparação: ${id}`);
			const actions = entry.prepareActions(context);
			reset();
			for (const action of actions) dispatch(action);
		}
		setTutorial(startTutorial(id, selectedHeroCardIds));
		setUiScreen("menu");
	}

	function leaveTutorial(destination: UiScreen) {
		if (tutorial)
			setLastTutorialAudit({
				session: finishTutorial(tutorial),
				gameJournalJson: exportJournalJson(journal),
			});
		if (destination !== "tutorialHub" || tutorial?.status !== "completed")
			reset();
		setTutorial(null);
		setUiScreen(destination);
	}

	const entry = tutorial ? getTutorialModule(tutorial.moduleId).entry : null;
	const nextModule = tutorial
		? TUTORIAL_MODULES[
				TUTORIAL_MODULES.findIndex(
					(module) => module.id === tutorial.moduleId,
				) + 1
			]
		: undefined;
	let screen: ReactNode;

	if (import.meta.env.DEV && showReplay) {
		screen = <Replay onClose={() => setShowReplay(false)} />;
	} else if (status === "VICTORY") {
		screen = <Victory />;
	} else if (status === "DEFEAT") {
		screen = <Defeat />;
	} else if (status !== "MAIN_MENU") {
		screen = (
			<Exploration
				tutorialMode={!!tutorial || uiScreen === "tutorialHub"}
				tutorialRevealEnabled={
					tutorial ? currentTutorialStep(tutorial).id === "reveal" : false
				}
			/>
		);
	} else if (uiScreen === "setup") {
		screen = (
			<Setup
				onBack={() =>
					tutorial ? leaveTutorial("tutorialHub") : setUiScreen("menu")
				}
				tutorialSeed={entry?.kind === "setup" ? entry.seed : undefined}
				deferInitialRoomReveal={
					entry?.kind === "setup" ? entry.deferInitialRoomReveal : false
				}
				onSelectionChange={
					tutorial
						? (ids) =>
								setTutorial((current) =>
									current ? selectTutorialHeroes(current, ids) : current,
								)
						: undefined
				}
			/>
		);
	} else {
		screen = (
			<MainMenu
				onNewGame={() => setUiScreen("setup")}
				onTutorial={() => setUiScreen("tutorialHub")}
			/>
		);
	}

	return (
		<>
			{screen}
			{uiScreen === "tutorialHub" && (
				<TutorialHub
					onStart={startModule}
					onClose={() => {
						reset();
						setUiScreen("menu");
					}}
					lastAudit={lastTutorialAudit}
				/>
			)}
			{tutorial && uiScreen !== "tutorialHub" && (
				<TutorialOverlay
					session={tutorial}
					journal={journal}
					nextModule={nextModule?.available ? nextModule : undefined}
					onNext={() => nextModule && startModule(nextModule.id)}
					onContinue={() =>
						setTutorial((current) =>
							current ? continueTutorial(current) : current,
						)
					}
					onSkip={() =>
						setTutorial((current) =>
							current ? skipTutorialObservation(current) : current,
						)
					}
					onBack={() =>
						setTutorial((current) =>
							current ? backTutorialObservation(current) : current,
						)
					}
					onClose={() => leaveTutorial("menu")}
					onRepeat={() => startModule(tutorial.moduleId)}
					onHub={() => leaveTutorial("tutorialHub")}
					onPlay={() => leaveTutorial("setup")}
				/>
			)}
			<RulesAccess
				inGame={
					status !== "MAIN_MENU" && status !== "VICTORY" && status !== "DEFEAT"
				}
			/>
		</>
	);
}

function RulesAccess({ inGame }: { inGame: boolean }) {
	const manualUrl = publicAssetUrl("rules/ascensao-heroica-manual.pdf");
	return (
		<nav
			className={`rules-access${inGame ? " rules-access--in-game" : ""}`}
			aria-label="Manual de regras"
		>
			<a href={manualUrl} target="_blank" rel="noopener noreferrer">
				? Regras
			</a>
			<a
				href={manualUrl}
				download="ascensao-heroica-manual.pdf"
				aria-label="Baixar manual em PDF"
			>
				↓ PDF
			</a>
		</nav>
	);
}

export default App;

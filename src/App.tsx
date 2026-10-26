import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { prepareCombatCheckpoint } from "@/ui/tutorials/combatScenario";
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
	markCombatCheckpointReady,
	recordCombatAttackInput,
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
	const preparedCheckpoints = useRef(new Set<string>());
	const tutorialRevision = tutorial?.events.length ?? 0;

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
		if (tutorialRevision === 0) return;
		setTutorial((current) =>
			current ? reconcileTutorial(current, view, journal) : current,
		);
	}, [view, journal, tutorialRevision]);

	useEffect(() => {
		if (
			!tutorial ||
			tutorial.moduleId !== "archive-two" ||
			currentTutorialStep(tutorial).id !== "combat-drag" ||
			tutorial.checkpointReady ||
			!tutorial.firstAttack ||
			preparedCheckpoints.current.has(tutorial.id)
		)
			return;
		preparedCheckpoints.current.add(tutorial.id);
		reset();
		for (const action of prepareCombatCheckpoint(
			tutorial.firstAttack.heroCardId,
		))
			dispatch(action);
		setTutorial((current) =>
			current ? markCombatCheckpointReady(current) : current,
		);
	}, [tutorial, reset, dispatch]);

	function startModule(id: TutorialModuleId) {
		const module = getTutorialModule(id);
		const entry = module.entry;
		const selectedHeroCardIds =
			(tutorial?.selectedHeroCardIds.length
				? tutorial.selectedHeroCardIds
				: null) ??
			(lastTutorialAudit?.session.selectedHeroCardIds.length
				? lastTutorialAudit.session.selectedHeroCardIds
				: null) ??
			(entry.kind === "prepared-board"
				? entry.defaultHeroCardIds
				: undefined) ??
			[];
		if (entry.kind === "setup") {
			reset();
			setTutorial(startTutorial(id));
			setUiScreen("setup");
			return;
		}
		const context = { view, selectedHeroCardIds };
		if (!entry.prepareActions) throw new Error(`Arquivo sem preparação: ${id}`);
		const actions = entry.prepareActions(context);
		if (!entry.canReuseBoard?.(context)) reset();
		for (const action of actions) dispatch(action);
		setTutorial(
			startTutorial(
				id,
				selectedHeroCardIds,
				window.matchMedia("(pointer: fine)").matches ? "drag" : "tap",
			),
		);
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
				tutorialCombatMode={tutorial?.moduleId === "archive-two"}
				tutorialCombatMethod={
					tutorial?.moduleId === "archive-two" &&
					currentTutorialStep(tutorial).id === "combat-drag"
						? tutorial.combatInput
						: null
				}
				onTutorialAttackInput={(method) =>
					setTutorial((current) =>
						current
							? recordCombatAttackInput(
									current,
									method,
									journal.entries.at(-1)?.sequence ?? 0,
								)
							: current,
					)
				}
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
					view={view}
					nextModule={nextModule?.available ? nextModule : undefined}
					onNext={() => nextModule && startModule(nextModule.id)}
					onContinue={() => {
						if (currentTutorialStep(tutorial).id === "combat-action")
							dispatch({ type: "CHECK_COMBAT_END" });
						else
							setTutorial((current) =>
								current ? continueTutorial(current) : current,
							);
					}}
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

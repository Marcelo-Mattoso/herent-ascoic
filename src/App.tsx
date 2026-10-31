import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { translate } from "@/i18n";
import { exportJournalJson } from "@/core/journal/gameJournal";
import type { PlayerView } from "@/core/projection/playerView";
import { Defeat } from "@/ui/screens/Defeat";
import { CombatFeedback } from "@/ui/components/CombatFeedback";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Replay } from "@/ui/screens/Replay";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { endScreenPreviewView } from "@/ui/screens/endScreenPreview";
import { useGameStore } from "@/ui/store/gameStore";
import { sfxPlayer } from "@/ui/audio/sfxPlayer";
import { GlobalMenu } from "@/ui/globalMenu/GlobalMenu";
import { SupportAction } from "@/ui/support/SupportAction";
import { TutorialHub } from "@/ui/tutorials/TutorialHub";
import { TutorialOverlay } from "@/ui/tutorials/TutorialOverlay";
import { prepareCombatCheckpoint } from "@/ui/tutorials/combatScenario";
import { ABILITY_BARBARIAN, ABILITY_HUNTER, prepareAbilityEncounter, preparePowerAndPassiveEncounter } from "@/ui/tutorials/abilitiesScenario";
import {
	prepareExhaustedInventoryTraining,
	prepareInventoryTraining,
} from "@/ui/tutorials/inventoryScenario";
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
	markInventoryCheckpointReady,
	markAbilityCheckpointReady,
	observeAbilityUi,
	observeInventoryUi,
	recordCombatAttackInput,
	reconcileTutorial,
	selectTutorialHeroes,
	skipTutorialObservation,
	startTutorial,
	type TutorialSession,
} from "@/ui/tutorials/session";

type UiScreen = "menu" | "setup" | "tutorialHub";

function rewardSignature(view: PlayerView): string {
	const items = [
		...view.groupArtifacts.map((artifact) => artifact.cardId),
		...view.pendingRewards.map((reward) => reward.cardId),
		...view.heroes.flatMap((hero) => [...hero.backpack, ...new Set(Object.values(hero.activeItems).filter((id): id is string => !!id))]),
	].sort();
	return JSON.stringify([view.groupXp, items]);
}

function App() {
	useTranslation(); // Re-renderiza as telas montadas quando o idioma muda.
	const { view, journal, dispatch, reset, loadTrainingState } = useGameStore();
	const cardImageUrls = useCardImages();
	const status = view.status;
	const [uiScreen, setUiScreen] = useState<UiScreen>("menu");
	const [tutorial, setTutorial] = useState<TutorialSession | null>(null);
	const [lastTutorialAudit, setLastTutorialAudit] =
		useState<TutorialAuditSnapshot | null>(null);
	const [showReplay, setShowReplay] = useState(false);
	const [endPreview, setEndPreview] = useState<"victory" | "defeat" | null>(null);
	const [inventoryOpened, setInventoryOpened] = useState(false);
	const [inventoryHeroSelected, setInventoryHeroSelected] = useState(false);
	const [inventoryDetailCardId, setInventoryDetailCardId] = useState<
		string | null
	>(null);
	const preparedCheckpoints = useRef(new Set<string>());
	const lastSfxState = useRef({
		room: view.currentRoom?.cardId ?? null,
		enemies: view.enemies.filter((enemy) => enemy.status === "active").map((enemy) => enemy.id).join("|"),
		rewards: rewardSignature(view),
	});
	const lastCombatSound = useRef({ roll: view.combat?.lastRoll ?? null, damageId: view.damageFeedback.at(-1)?.id ?? 0 });
	const tutorialRevision = tutorial?.events.length ?? 0;
	useEffect(() => {
		const previous = lastSfxState.current;
		const room = view.currentRoom?.cardId ?? null;
		const enemies = view.enemies.filter((enemy) => enemy.status === "active").map((enemy) => enemy.id).join("|");
		const rewards = rewardSignature(view);
		if (room && room !== previous.room) sfxPlayer.play("room_reveal");
		if (enemies && enemies !== previous.enemies && (view.status === "COMBAT_START" || view.status === "HERO_ACTION" || view.status === "BOSS_COMBAT")) sfxPlayer.play("enemy_reveal");
		if (rewards !== previous.rewards && view.status === "REWARD_PHASE") sfxPlayer.play("reward_gain");
		lastSfxState.current = { room, enemies, rewards };
	}, [view]);
	useEffect(() => {
		const previous = lastCombatSound.current;
		const currentRoll = view.combat?.lastRoll ?? null;
		const damageId = view.damageFeedback.at(-1)?.id ?? 0;
		if (previous.roll && !currentRoll && damageId === previous.damageId && previous.roll.heroTotal !== previous.roll.enemyTotal) {
			sfxPlayer.play("attack_defend");
		}
		lastCombatSound.current = { roll: currentRoll, damageId };
	}, [view.combat?.lastRoll, view.damageFeedback]);

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
		if (tutorial?.moduleId !== "archive-three") return;
		const panelOpen =
			inventoryOpened &&
			!!document.querySelector('[data-tutorial-anchor="hero.inventory"]');
		setTutorial((current) =>
			current
				? observeInventoryUi(current, panelOpen, inventoryDetailCardId, view)
				: current,
		);
	}, [tutorial?.moduleId, inventoryOpened, inventoryDetailCardId, view]);

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
		for (const action of prepareCombatCheckpoint(tutorial.firstAttack.heroCardId)) dispatch(action);
		setTutorial((current) =>
			current ? markCombatCheckpointReady(current) : current,
		);
	}, [tutorial, reset, dispatch]);

	useEffect(() => {
		if (
			!tutorial ||
			tutorial.moduleId !== "archive-three" ||
			currentTutorialStep(tutorial).id !== "item-states" ||
			tutorial.inventoryCheckpointReady ||
			preparedCheckpoints.current.has(`${tutorial.id}:items`)
		)
			return;
		preparedCheckpoints.current.add(`${tutorial.id}:items`);
		const previousJournalJson = exportJournalJson(journal);
		let training: ReturnType<typeof prepareExhaustedInventoryTraining>;
		try {
			training = prepareExhaustedInventoryTraining(
				tutorial.selectedHeroCardIds[0],
			);
		} catch {
			training = prepareExhaustedInventoryTraining();
		}
		loadTrainingState(training);
		setInventoryOpened(false);
		setTutorial((current) =>
			current
				? markInventoryCheckpointReady(
						current,
						previousJournalJson,
						training.heroes[0].cardId,
					)
				: current,
		);
	}, [tutorial, journal, loadTrainingState]);

	useEffect(() => {
		if (!tutorial || tutorial.moduleId !== "archive-four") return;
		const step = currentTutorialStep(tutorial).id;
		const checkpoint = step === "fury-prepare" ? "barbarian" : step === "hero-power" ? "warrior" : null;
		if (!checkpoint || tutorial.abilityCheckpoint === checkpoint || preparedCheckpoints.current.has(`${tutorial.id}:${checkpoint}`)) return;
		preparedCheckpoints.current.add(`${tutorial.id}:${checkpoint}`);
		loadTrainingState(checkpoint === "barbarian" ? prepareAbilityEncounter(ABILITY_BARBARIAN) : preparePowerAndPassiveEncounter());
		setTutorial((current) => current ? markAbilityCheckpointReady(current, checkpoint) : current);
	}, [tutorial, loadTrainingState]);

	function startModule(id: TutorialModuleId) {
		setInventoryOpened(false);
		setInventoryHeroSelected(false);
		setInventoryDetailCardId(null);
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
		if (id === "archive-three") {
			const preferredHero =
				selectedHeroCardIds[0] ?? "hero_broken_bastion_warrior";
			let training: ReturnType<typeof prepareInventoryTraining>;
			let heroId = preferredHero;
			try {
				training = prepareInventoryTraining(preferredHero);
			} catch {
				heroId = "hero_broken_bastion_warrior";
				training = prepareInventoryTraining(heroId);
			}
			loadTrainingState(training);
			setTutorial(startTutorial(id, [heroId]));
			setUiScreen("menu");
			return;
		}
		if (id === "archive-four") {
			loadTrainingState(prepareAbilityEncounter(ABILITY_HUNTER));
			setTutorial(markAbilityCheckpointReady(startTutorial(id, [ABILITY_HUNTER]), "hunter"));
			setUiScreen("menu");
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
		setInventoryOpened(false);
		setInventoryHeroSelected(false);
		setInventoryDetailCardId(null);
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
	} else if (import.meta.env.DEV && endPreview) {
		const previewView = endScreenPreviewView(view, endPreview);
		const onPlayAgain = () => { setEndPreview(null); setUiScreen("setup"); };
		const onMenu = () => { setEndPreview(null); setUiScreen("menu"); };
		screen = endPreview === "victory"
			? <Victory imageUrls={cardImageUrls} previewView={previewView} onPlayAgain={onPlayAgain} onMenu={onMenu} />
			: <Defeat imageUrls={cardImageUrls} previewView={previewView} onPlayAgain={onPlayAgain} onMenu={onMenu} />;
	} else if (status === "VICTORY") {
		screen = <Victory imageUrls={cardImageUrls} onPlayAgain={() => { reset(); setUiScreen("setup"); }} onMenu={() => { reset(); setUiScreen("menu"); }} />;
	} else if (status === "DEFEAT") {
		screen = <Defeat imageUrls={cardImageUrls} onPlayAgain={() => { reset(); setUiScreen("setup"); }} onMenu={() => { reset(); setUiScreen("menu"); }} />;
	} else if (status !== "MAIN_MENU") {
		screen = (
			<Exploration
				key={tutorial?.moduleId === "archive-four" ? `${tutorial.id}:${tutorial.abilityCheckpoint}` : "ordinary-board"}
				tutorialAbilityMode={tutorial?.moduleId === "archive-four"}
				onTutorialAbilityPanelOpen={() => setTutorial((current) => current ? observeAbilityUi(current, "panel") : current)}
				onTutorialAbilityCardInspect={() => setTutorial((current) => current ? observeAbilityUi(current, "card") : current)}
				tutorialInventoryMode={tutorial?.moduleId === "archive-three"}
				tutorialInventoryOpen={inventoryOpened}
				tutorialInventoryHeroSelected={inventoryHeroSelected}
				onTutorialInventoryHeroSelected={() => setInventoryHeroSelected(true)}
				onTutorialInventoryOpen={() => setInventoryOpened(true)}
				onTutorialItemDetailChange={setInventoryDetailCardId}
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
				onPreviewVictory={() => setEndPreview("victory")}
				onPreviewDefeat={() => setEndPreview("defeat")}
			/>
		);
	}

	return (
		<>
			{screen}
			{import.meta.env.DEV && endPreview && !showReplay && (
				<nav className="end-preview-toolbar" aria-label={translate("game:screens.devPreview.toolbarLabel")}>
					<span>{translate("game:screens.devPreview.badge")}</span>
					<button type="button" aria-current={endPreview === "victory" ? "page" : undefined} onClick={() => setEndPreview("victory")}>{translate("game:screens.victory.dynamic001")}</button>
					<button type="button" aria-current={endPreview === "defeat" ? "page" : undefined} onClick={() => setEndPreview("defeat")}>{translate("game:screens.defeat.text003")}</button>
					<button type="button" onClick={() => setEndPreview(null)} aria-label={translate("game:screens.defeat.text007")}>×</button>
				</nav>
			)}
			<CombatFeedback view={view} cardImageUrls={cardImageUrls} />
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
						if (currentTutorialStep(tutorial).id === "combat-action") {
							if (status === "DIRECT_DAMAGE" || status === "CHECK_COMBAT_END") dispatch({ type: "CHECK_COMBAT_END" });
						}
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
			{status === "MAIN_MENU" && uiScreen === "menu" && !tutorial && !endPreview && <SupportAction />}
			<GlobalMenu />
		</>
	);
}

export default App;

import type { PlayerView } from "@/core/projection/playerView";
import type { CombatRollResult } from "@/core/state/combatState";
import type { GameJournal, JournalEntry } from "@/core/journal/gameJournal";
import { getTutorialModule, type TutorialModuleId } from "./registry";

export interface TutorialEvent {
	readonly type:
		| "started"
		| "hero-selected"
		| "game-started"
		| "room-revealed"
		| "combat-checkpoint"
		| "combat-attack-input"
		| "combat-attack-resolved"
		| "combat-ended"
		| "step"
		| "step-completed"
		| "completed"
		| "abandoned";
	readonly source: "tutorial-ui" | "game-observation";
	readonly stepId: string;
	readonly detail?: string;
}

export interface CombatObservation {
	readonly actionId: string;
	readonly heroCardId: string;
	readonly heroName: string;
	readonly enemyName: string;
	readonly roll: CombatRollResult;
	readonly heroLifeBefore: number;
	readonly heroLifeAfter: number;
	readonly enemyLifeBefore: number;
	readonly enemyLifeAfter: number;
	readonly heroesActed: readonly string[];
	readonly messages: readonly string[];
}

export interface TutorialSession {
	readonly id: string;
	readonly moduleId: TutorialModuleId;
	readonly status:
		| "running"
		| "waiting_for_interaction"
		| "completed"
		| "cancelled";
	readonly stepIndex: number;
	readonly highlightIndex: number;
	readonly selectedHeroCardIds: readonly string[];
	readonly events: readonly TutorialEvent[];
	readonly combatInput: "drag" | "tap";
	readonly checkpointReady: boolean;
	readonly attackMethodIntent: "drag" | "tap" | null;
	readonly attackIntentSequence: number;
	readonly firstAttack?: CombatObservation;
	readonly finalAttack?: CombatObservation;
}

export function startTutorial(
	moduleId: TutorialModuleId,
	selectedHeroCardIds: readonly string[] = [],
	combatInput: "drag" | "tap" = "drag",
): TutorialSession {
	const module = getTutorialModule(moduleId);
	if (!module.available || module.steps.length === 0)
		throw new Error("Arquivo indisponível");
	return {
		id: globalThis.crypto?.randomUUID?.() ?? `tutorial-${Date.now()}`,
		moduleId,
		status: "running",
		stepIndex: 0,
		highlightIndex: 0,
		selectedHeroCardIds: [...selectedHeroCardIds],
		combatInput,
		checkpointReady: false,
		attackMethodIntent: null,
		attackIntentSequence: 0,
		events: [
			{
				type: "started",
				source: "tutorial-ui",
				stepId: module.steps[0].id,
				detail: moduleId,
			},
			{ type: "step", source: "tutorial-ui", stepId: module.steps[0].id },
		],
	};
}

function observedAttack(entry: JournalEntry): CombatObservation | null {
	if (entry.actionType !== "RESOLVE_ATTACK" || !entry.roll) return null;
	const { heroId, enemyId } = entry.roll;
	const beforeHero = entry.before.heroes.find((hero) => hero.id === heroId);
	const afterHero = entry.after.heroes.find((hero) => hero.id === heroId);
	const beforeEnemy = entry.before.enemies.find(
		(enemy) => enemy.id === enemyId,
	);
	const afterEnemy = [
		...entry.after.enemies,
		...entry.after.defeatedEnemies,
	].find((enemy) => enemy.id === enemyId);
	if (!beforeHero || !afterHero || !beforeEnemy || !afterEnemy) return null;
	return {
		actionId: entry.actionId,
		heroCardId: beforeHero.cardId,
		heroName: beforeHero.name,
		enemyName: beforeEnemy.name,
		roll: entry.roll,
		heroLifeBefore: beforeHero.life,
		heroLifeAfter: afterHero.life,
		enemyLifeBefore: beforeEnemy.life,
		enemyLifeAfter: afterEnemy.life,
		heroesActed: entry.after.heroesActed,
		messages: entry.messages,
	};
}

export function markCombatCheckpointReady(
	session: TutorialSession,
): TutorialSession {
	if (
		session.moduleId !== "archive-two" ||
		currentTutorialStep(session).id !== "combat-drag" ||
		session.checkpointReady
	)
		return session;
	return {
		...session,
		checkpointReady: true,
		events: [
			...session.events,
			{
				type: "combat-checkpoint",
				source: "tutorial-ui",
				stepId: "combat-drag",
				detail: "valid seeded encounter",
			},
		],
	};
}

export function recordCombatAttackInput(
	session: TutorialSession,
	method: "drag" | "tap",
	afterSequence: number,
): TutorialSession {
	if (
		session.moduleId !== "archive-two" ||
		currentTutorialStep(session).id !== "combat-drag" ||
		!session.checkpointReady
	)
		return session;
	return {
		...session,
		attackMethodIntent: method,
		attackIntentSequence: afterSequence,
		events: [
			...session.events,
			{
				type: "combat-attack-input",
				source: "tutorial-ui",
				stepId: "combat-drag",
				detail: method,
			},
		],
	};
}

export function currentTutorialStep(session: TutorialSession) {
	return getTutorialModule(session.moduleId).steps[session.stepIndex];
}

function nextStep(session: TutorialSession): TutorialSession {
	const steps = getTutorialModule(session.moduleId).steps;
	if (session.stepIndex >= steps.length - 1) return session;
	const stepIndex = session.stepIndex + 1;
	return {
		...session,
		stepIndex,
		highlightIndex: 0,
		status:
			steps[stepIndex].kind === "completion"
				? "completed"
				: steps[stepIndex].kind === "interaction"
					? "waiting_for_interaction"
					: "running",
		events: [
			...session.events,
			{
				type: "step-completed",
				source: "tutorial-ui",
				stepId: steps[session.stepIndex].id,
			},
			{ type: "step", source: "tutorial-ui", stepId: steps[stepIndex].id },
			...(steps[stepIndex].kind === "completion"
				? [
						{
							type: "completed" as const,
							source: "tutorial-ui" as const,
							stepId: steps[stepIndex].id,
						},
					]
				: []),
		],
	};
}

export function selectTutorialHeroes(
	session: TutorialSession,
	ids: readonly string[],
): TutorialSession {
	if (ids.join("|") === session.selectedHeroCardIds.join("|")) return session;
	const updated = {
		...session,
		selectedHeroCardIds: [...ids],
		events: [
			...session.events,
			{
				type: "hero-selected" as const,
				source: "tutorial-ui" as const,
				stepId: currentTutorialStep(session).id,
				detail: ids.join(","),
			},
		],
	};
	return currentTutorialStep(session).advance === "hero-selected" &&
		ids.length > 0
		? nextStep(updated)
		: updated;
}

export function reconcileTutorial(
	session: TutorialSession,
	view: PlayerView,
	journal?: GameJournal,
): TutorialSession {
	const advance = currentTutorialStep(session).advance;
	if (session.moduleId === "archive-two") {
		const latest = journal?.entries.at(-1);
		if (
			advance === "combat-hero-selected" &&
			latest?.actionType === "CHOOSE_HERO_FOR_ROUND" &&
			view.combat?.phase === "selecting_target"
		)
			return nextStep(session);
		if (advance === "combat-first-resolved" && latest) {
			const firstAttack = observedAttack(latest);
			if (firstAttack) return nextStep({ ...session, firstAttack });
		}
		if (
			advance === "combat-second-declared" &&
			session.checkpointReady &&
			session.attackMethodIntent &&
			(session.combatInput === "tap" ||
				session.attackMethodIntent === "drag") &&
			journal?.entries.some(
				(entry) =>
					entry.sequence > session.attackIntentSequence &&
					entry.actionType === "CHOOSE_TARGET",
			) &&
			(view.status === "ROLL_DICE" || view.status === "RESOLVE_ATTACK")
		)
			return nextStep(session);
		if (advance === "combat-second-resolved" && latest) {
			const finalAttack = observedAttack(latest);
			if (finalAttack)
				return nextStep({
					...session,
					finalAttack,
					events: [
						...session.events,
						{
							type: "combat-attack-resolved",
							source: "game-observation",
							stepId: "combat-dice",
							detail: finalAttack.actionId,
						},
					],
				});
		}
		if (
			advance === "combat-ended" &&
			latest?.actionType === "CHECK_COMBAT_END" &&
			view.status === "REWARD_PHASE"
		)
			return nextStep({
				...session,
				events: [
					...session.events,
					{
						type: "combat-ended",
						source: "game-observation",
						stepId: "combat-action",
						detail: latest.actionId,
					},
				],
			});
	}
	if (
		advance === "game-started" &&
		view.status !== "MAIN_MENU" &&
		view.heroes.length > 0
	) {
		return nextStep({
			...session,
			events: [
				...session.events,
				{ type: "game-started", source: "game-observation", stepId: "start" },
			],
		});
	}
	if (
		advance === "room-revealed" &&
		view.currentRoom &&
		view.status === "COMBAT_START"
	) {
		return nextStep({
			...session,
			events: [
				...session.events,
				{
					type: "room-revealed",
					source: "game-observation",
					stepId: "reveal",
					detail: view.currentRoom.cardId,
				},
			],
		});
	}
	return session;
}

export function continueTutorial(session: TutorialSession): TutorialSession {
	const step = currentTutorialStep(session);
	if (step.advance !== "manual") return session;
	if (step.id === "group" && session.selectedHeroCardIds.length === 0)
		return session;
	if (step.highlights && session.highlightIndex < step.highlights.length - 1) {
		return { ...session, highlightIndex: session.highlightIndex + 1 };
	}
	return nextStep(session);
}

export function skipTutorialObservation(
	session: TutorialSession,
): TutorialSession {
	return currentTutorialStep(session).skippable ? nextStep(session) : session;
}

export function backTutorialObservation(
	session: TutorialSession,
): TutorialSession {
	const step = currentTutorialStep(session);
	if (step.highlights && session.highlightIndex > 0)
		return { ...session, highlightIndex: session.highlightIndex - 1 };
	const previous = getTutorialModule(session.moduleId).steps[
		session.stepIndex - 1
	];
	if (
		previous &&
		previous.advance === "manual" &&
		(step.advance === "manual" ||
			step.kind === "completion" ||
			step.id === "combat-action")
	) {
		return {
			...session,
			stepIndex: session.stepIndex - 1,
			highlightIndex: 0,
			status: "running",
		};
	}
	return session;
}

export function finishTutorial(session: TutorialSession): TutorialSession {
	return session.status === "completed"
		? session
		: {
				...session,
				status: "cancelled",
				events: [
					...session.events,
					{
						type: "abandoned",
						source: "tutorial-ui",
						stepId: currentTutorialStep(session).id,
					},
				],
			};
}

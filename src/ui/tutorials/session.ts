import type { PlayerView } from "@/core/projection/playerView";
import type { CombatRollResult } from "@/core/state/combatState";
import type { GameJournal, JournalEntry } from "@/core/journal/gameJournal";
import { getTutorialModule, type TutorialModuleId } from "./registry";
import { INVENTORY_ITEMS } from "./inventoryScenario";
import { ABILITY_BARBARIAN, ABILITY_HUNTER, ABILITY_WARRIOR, BASTION_POWER, CRIMSON_FURY, PREY_MARK } from "./abilitiesScenario";

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
		| "inventory-opened"
		| "item-inspected"
		| "inventory-action"
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
	readonly reviewStepIndex?: number;
	readonly selectedHeroCardIds: readonly string[];
	readonly events: readonly TutorialEvent[];
	readonly combatInput: "drag" | "tap";
	readonly checkpointReady: boolean;
	readonly attackMethodIntent: "drag" | "tap" | null;
	readonly attackIntentSequence: number;
	readonly firstAttack?: CombatObservation;
	readonly finalAttack?: CombatObservation;
	readonly inspectedItemId?: string;
	readonly inventoryResult?: {
		readonly itemId: string;
		readonly changes: readonly string[];
	};
	readonly inventoryCheckpointReady?: boolean;
	readonly previousInventoryJournalJson?: string;
	readonly abilityCheckpoint?: "hunter" | "barbarian" | "warrior";
	readonly abilityPanelOpened?: boolean;
	readonly abilityResult?: readonly string[];
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
		session.reviewStepIndex !== undefined ||
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

export function markInventoryCheckpointReady(
	session: TutorialSession,
	previousJournalJson: string,
	heroCardId: string,
): TutorialSession {
	if (
		session.moduleId !== "archive-three" ||
		currentTutorialStep(session).id !== "item-states" ||
		session.inventoryCheckpointReady
	)
		return session;
	return {
		...session,
		inventoryCheckpointReady: true,
		selectedHeroCardIds: [heroCardId],
		previousInventoryJournalJson: previousJournalJson,
		events: [
			...session.events,
			{
				type: "inventory-action",
				source: "game-observation",
				stepId: "item-states",
				detail: "valid exhausted charm checkpoint",
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
		session.reviewStepIndex !== undefined ||
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
	return getTutorialModule(session.moduleId).steps[session.reviewStepIndex ?? session.stepIndex];
}

export function markAbilityCheckpointReady(session: TutorialSession, checkpoint: "hunter" | "barbarian" | "warrior"): TutorialSession {
	if (session.moduleId !== "archive-four" || session.abilityCheckpoint === checkpoint) return session;
	return { ...session, abilityCheckpoint: checkpoint,
		selectedHeroCardIds: [checkpoint === "hunter" ? ABILITY_HUNTER : checkpoint === "barbarian" ? ABILITY_BARBARIAN : ABILITY_WARRIOR],
		events: [...session.events, { type: "combat-checkpoint", source: "game-observation", stepId: currentTutorialStep(session).id, detail: checkpoint }],
	};
}

export function observeAbilityUi(session: TutorialSession, event: "panel" | "card"): TutorialSession {
	if (session.reviewStepIndex !== undefined || session.moduleId !== "archive-four" || currentTutorialStep(session).id !== "abilities-inspect") return session;
	if (event === "panel") return session.abilityPanelOpened ? session : { ...session, abilityPanelOpened: true };
	return session.abilityPanelOpened ? nextStep({ ...session, events: [...session.events, { type: "item-inspected", source: "tutorial-ui", stepId: "abilities-inspect", detail: ABILITY_HUNTER }] }) : session;
}

export function observeInventoryUi(
	session: TutorialSession,
	panelOpen: boolean,
	detailCardId: string | null,
	view: PlayerView,
): TutorialSession {
	if (session.reviewStepIndex !== undefined || session.moduleId !== "archive-three") return session;
	const step = currentTutorialStep(session);
	if (step.id === "inventory-open" && panelOpen)
		return nextStep({
			...session,
			events: [
				...session.events,
				{ type: "inventory-opened", source: "tutorial-ui", stepId: step.id },
			],
		});
	if (step.id !== "item-inspect") return session;
	const valid =
		detailCardId &&
		view.heroes.some((hero) => hero.backpack.includes(detailCardId));
	if (valid && session.inspectedItemId !== detailCardId)
		return { ...session, inspectedItemId: detailCardId };
	if (!detailCardId && session.inspectedItemId)
		return nextStep({
			...session,
			events: [
				...session.events,
				{
					type: "item-inspected",
					source: "tutorial-ui",
					stepId: step.id,
					detail: session.inspectedItemId,
				},
			],
		});
	return session;
}

function movedItem(
	entry: JournalEntry | undefined,
	itemId: string,
	slots: readonly string[],
): boolean {
	if (entry?.actionType !== "INV_MOVE") return false;
	return entry.before.heroes.some((beforeHero) => {
		const afterHero = entry.after.heroes.find(
			(hero) => hero.id === beforeHero.id,
		);
		return (
			beforeHero.backpack.some((card) => card?.id === itemId) &&
			!!afterHero?.equipment.some(
				(equipment) =>
					slots.includes(equipment.slot) && equipment.card?.id === itemId,
			) &&
			!afterHero.backpack.some((card) => card?.id === itemId)
		);
	});
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
	if (session.reviewStepIndex !== undefined || ids.join("|") === session.selectedHeroCardIds.join("|")) return session;
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
	if (session.reviewStepIndex !== undefined) return session;
	const advance = currentTutorialStep(session).advance;
	if (session.moduleId === "archive-four") {
		const latest = journal?.entries.at(-1);
		const hero = view.heroes[0];
		const heroId = hero?.id;
		if (!latest || !heroId) return session;
		const observed = (detail: string) => nextStep({ ...session,
			abilityResult: latest.changes,
			events: [...session.events, { type: "inventory-action", source: "game-observation", stepId: currentTutorialStep(session).id, detail }],
		});
		if (advance === "prey-marked" && session.abilityCheckpoint === "hunter" &&
			latest.actionType === "SELECT_SKILL_TARGET" &&
			latest.before.heroes[0]?.cardId === ABILITY_HUNTER &&
			view.activeInfluences.some((influence) => influence.id === `prey:${heroId}`) &&
			latest.before.heroesActed.join("|") === latest.after.heroesActed.join("|"))
			return observed(`${PREY_MARK}: ${latest.actionId}`);
		if (advance === "hunter-attack-resolved" && session.abilityCheckpoint === "hunter" &&
			latest.actionType === "RESOLVE_ATTACK" && latest.roll?.heroId === heroId &&
			latest.after.heroesActed.includes(heroId))
			return observed(`${PREY_MARK}: ataque ${latest.actionId}`);
		if (advance === "fury-prepared" && session.abilityCheckpoint === "barbarian" &&
			latest.actionType === "USE_SKILL" && hero.cardId === ABILITY_BARBARIAN &&
			latest.after.preparedAbilities.some((prepared) => prepared.abilityId === CRIMSON_FURY) &&
			!latest.before.preparedAbilities.some((prepared) => prepared.abilityId === CRIMSON_FURY) &&
			latest.after.heroesActed.join("|") === latest.before.heroesActed.join("|"))
			return observed(`${CRIMSON_FURY}: ${latest.actionId}`);
		if (advance === "fury-triggered" && session.abilityCheckpoint === "barbarian" &&
			latest.actionType === "RESOLVE_ATTACK" && latest.roll?.heroId === heroId &&
			journal?.entries.some((entry) => (entry.actionType === "ROLL_DICE" || entry.actionType === "PREPARE_PHYSICAL_ROLL") &&
				entry.before.preparedAbilities.some((prepared) => prepared.abilityId === CRIMSON_FURY) &&
				!entry.after.preparedAbilities.some((prepared) => prepared.abilityId === CRIMSON_FURY)) &&
			!view.pendingTriggerInterrupt && latest.after.heroesActed.includes(heroId))
			return nextStep({ ...session,
				abilityResult: ["Fúria ativada.", ...journal.entries.filter((entry) => entry.actionType === "ROLL_DICE" || entry.actionType === "PREPARE_PHYSICAL_ROLL").at(-1)!.changes, ...latest.changes],
				events: [...session.events, { type: "combat-attack-resolved", source: "game-observation", stepId: "fury-trigger", detail: `${CRIMSON_FURY}: ${latest.actionId}` }],
			});
		if (advance === "power-used" && session.abilityCheckpoint === "warrior" &&
			latest.actionType === "USE_POWER" && hero.cardId === ABILITY_WARRIOR &&
			view.abilityActionsByHero[heroId]?.some((action) => action.abilityId === BASTION_POWER && action.status === "exhausted") &&
			latest.changes.length > 0 &&
			latest.after.heroesActed.join("|") === latest.before.heroesActed.join("|"))
			return observed(`${BASTION_POWER}: ${latest.actionId}`);
		return session;
	}
	if (session.moduleId === "archive-three") {
		const latest = journal?.entries.at(-1);
		const itemId =
			advance === "dagger-equipped"
				? INVENTORY_ITEMS.dagger
				: advance === "axe-equipped"
					? INVENTORY_ITEMS.axe
					: advance === "armor-equipped"
						? INVENTORY_ITEMS.armor
						: null;
		const slots =
			advance === "armor-equipped"
				? ["clothing1", "clothing2"]
				: advance === "dagger-equipped"
					? ["hand1", "hand2"]
					: ["hand1"];
		if (itemId && movedItem(latest, itemId, slots)) {
			const afterHero = latest?.after.heroes.find((hero) =>
				hero.equipment.some((equipment) => equipment.card?.id === itemId),
			);
			const valid =
				advance !== "axe-equipped" ||
				(!!afterHero?.equipment.some(
					(equipment) =>
						equipment.slot === "hand2" && equipment.sharedWith === "hand1",
				) &&
					!afterHero.backpack.some((card) => card?.id === itemId));
			if (valid)
				return nextStep({
					...session,
					inventoryResult: { itemId, changes: latest?.changes ?? [] },
					events: [
						...session.events,
						{
							type: "inventory-action",
							source: "game-observation",
							stepId: currentTutorialStep(session).id,
							detail: latest?.actionId,
						},
					],
				});
		}
		if (
			advance === "item-used" &&
			latest?.actionType === "USE_ITEM" &&
			latest.before.heroes.some((hero) =>
				hero.equipment.some(
					(equipment) => equipment.card?.id === INVENTORY_ITEMS.precision,
				),
			) &&
			latest.after.heroes.some(
				(hero) =>
					hero.modifiers.some(
						(modifier) =>
							modifier.sourceId === "ability_hit_bonus_once" &&
							modifier.target === "hit_bonus",
					) &&
					!latest.before.heroes
						.find((beforeHero) => beforeHero.id === hero.id)
						?.modifiers.some(
							(modifier) => modifier.sourceId === "ability_hit_bonus_once",
						),
			) &&
			latest.after.decks.some(
				(deck) =>
					deck.id === "itemDeck" &&
					deck.discarded.some((card) => card.id === INVENTORY_ITEMS.precision),
			) &&
			!latest.after.heroes.some((hero) =>
				hero.equipment.some(
					(equipment) => equipment.card?.id === INVENTORY_ITEMS.precision,
				),
			) &&
			latest.after.heroesActed.join("|") === latest.before.heroesActed.join("|")
		)
			return nextStep({
				...session,
				inventoryResult: {
					itemId: INVENTORY_ITEMS.precision,
					changes: latest.changes,
				},
				events: [
					...session.events,
					{
						type: "inventory-action",
						source: "game-observation",
						stepId: "use-item",
						detail: latest.actionId,
					},
				],
			});
	}
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
	if (session.reviewStepIndex !== undefined) {
		const reviewStep = currentTutorialStep(session);
		if (reviewStep.highlights && session.highlightIndex < reviewStep.highlights.length - 1)
			return { ...session, highlightIndex: session.highlightIndex + 1 };
		const nextReviewStepIndex = session.reviewStepIndex + 1;
		return { ...session,
			reviewStepIndex: nextReviewStepIndex < session.stepIndex ? nextReviewStepIndex : undefined,
			highlightIndex: 0,
		};
	}
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
	return session.reviewStepIndex === undefined && currentTutorialStep(session).skippable ? nextStep(session) : session;
}

export function backTutorialObservation(session: TutorialSession): TutorialSession {
	const step = currentTutorialStep(session);
	if (step.highlights && session.highlightIndex > 0)
		return { ...session, highlightIndex: session.highlightIndex - 1 };
	const displayedStepIndex = session.reviewStepIndex ?? session.stepIndex;
	if (displayedStepIndex === 0) return session;
	return { ...session, reviewStepIndex: displayedStepIndex - 1, highlightIndex: 0 };
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

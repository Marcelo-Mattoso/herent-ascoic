import type { Action } from "../actions/types";
import { PARTY_PLAYER } from "../choices";
import { answerPendingBy } from "../../engine/choice";
import { drainStack } from "../effects/resolver";
import { evaluate } from "../skills/dsl/evaluate";
import { buildScriptCtx } from "../scripts/context";
import {
	applySkillWindowDecision,
	resolveSkillWindow,
	skipSkillWindowDecision,
	type PendingSkillWindow,
} from "../skills/resolveSkillWindow";
import { fireTriggerDecision, triggerDecisionFlag } from "../triggers/engine";
import { applyDamage, continueDamage } from "../systems/damageSystem";
import type { GameState } from "../state/gameState";
import type { GameEngine, GameHandler } from "../gameEngine";
import { skillById, skillName } from "../gameEngine";
import { gameOf, withGame } from "../../engine/state";
import {
	decksOf,
	pendingChoicesOf,
	pendingSkillChoiceOf,
	pendingSkillTargetOf,
	pendingSkillWindowOf,
	pendingTriggerInterruptOf,
	withDecks,
	withNestedSkillWindow,
	withPendingSkillChoice,
	withPendingSkillWindow,
	withPendingTriggerInterrupt,
} from "../state/access";
import {
	advanceAfterEnemyDefeat,
	advanceAfterHeroDisabledForRound,
	handleCancelSkillTarget,
	handleResolveAttack,
	handlePreparePhysicalRoll,
	handleRollDice,
	handleSelectSkillTarget,
	resumeAttackAfterDamage,
} from "./combat";
import { continueRewardsAfterRoomWin, finishGrantRewards } from "./reward";
import { discardFromDungeonDeck, resumeDungeonAdvance } from "./exploration";
import { log } from "./utils";

type SkillChoicePayload = Extract<Action, { type: "SKILL_CHOICE" }>["payload"];
type InterruptPayload = Extract<
	Action,
	{ type: "APPLY_TRIGGER_INTERRUPT" }
>["payload"];

export function resumeAfterTriggerDecision(
	engine: GameEngine,
	state: GameState,
	pendingWindow: string,
): GameState {
	if (pendingTriggerInterruptOf(state)) return state;
	if (
		pendingWindow === "before_attack_roll" &&
		gameOf(state).status === "ROLL_DICE"
	) {
		return gameOf(state).combat?.physicalRollPreparing
			? handlePreparePhysicalRoll(engine, state, true)
			: handleRollDice(engine, state);
	}
	return state;
}

export function resumeAfterSkillWindow(
	engine: GameEngine,
	state: GameState,
	window: PendingSkillWindow | undefined,
	forceResolve = false,
): GameState {
	if (
		!window ||
		pendingTriggerInterruptOf(state) ||
		pendingSkillChoiceOf(state) ||
		pendingSkillTargetOf(state) ||
		gameOf(state).combat?.pendingDiceSelection
	) {
		return state;
	}
	const resumedWindow = withPendingSkillWindow(state, undefined);
	const continued =
		pendingSkillWindowOf(state) || forceResolve
			? resolveSkillWindow(engine, resumedWindow, window)
			: resumedWindow;
	const afterStack = drainStack(engine, continued);
	const attachParent = (next: GameState): GameState =>
		window.parent &&
		(pendingTriggerInterruptOf(next) ||
			pendingSkillChoiceOf(next) ||
			pendingSkillTargetOf(next))
			? withNestedSkillWindow(next, window.parent)
			: next;
	if (
		pendingTriggerInterruptOf(afterStack) ||
		pendingSkillChoiceOf(afterStack) ||
		pendingSkillTargetOf(afterStack) ||
		gameOf(afterStack).combat?.pendingDiceSelection
	) {
		return attachParent(afterStack);
	}
	const result: GameState = (() => {
		switch (window.resume.type) {
			case "roll_dice":
				return handleRollDice(engine, afterStack);
			case "prepare_physical_roll":
				return handlePreparePhysicalRoll(engine, afterStack, true);
			case "resolve_attack":
				return handleResolveAttack(engine, afterStack);
			case "after_roll":
				return afterStack;
			case "continue_rewards_after_room_win":
				return continueRewardsAfterRoomWin(engine, afterStack);
			case "finish_rewards":
				return finishGrantRewards(afterStack);
			case "continue_damage": {
				const afterDamage = continueDamage(engine, afterStack, window.resume);
				if (
					pendingTriggerInterruptOf(afterDamage) ||
					pendingSkillChoiceOf(afterDamage) ||
					pendingSkillTargetOf(afterDamage)
				)
					return afterDamage;
				return window.resume.afterAttack
					? resumeAttackAfterDamage(
							engine,
							afterDamage,
							window.resume.afterAttack,
						)
					: advanceAfterEnemyDefeat(afterDamage);
			}
			case "apply_damage":
				return advanceAfterEnemyDefeat(
					applyDamage(
						engine,
						afterStack,
						window.resume.targetId,
						window.resume.amount,
						{
							sourceId: window.resume.sourceId,
							damageType: window.resume.damageType,
							skipWouldBeDestroyed: true,
							resolvedAmount: window.resume.amount,
						},
					),
				);
			case "advance_dungeon":
				return resumeDungeonAdvance(engine, afterStack, window.resume.exits);
			case "discard_dungeon":
				return discardFromDungeonDeck(
					engine,
					afterStack,
					window.resume.count,
					window.resume.reason,
					true,
				);
			case "none":
				return advanceAfterEnemyDefeat(afterStack);
		}
	})();
	if (
		pendingTriggerInterruptOf(result) ||
		pendingSkillChoiceOf(result) ||
		pendingSkillTargetOf(result) ||
		gameOf(result).combat?.pendingDiceSelection
	)
		return attachParent(result);
	return window.parent
		? resumeAfterSkillWindow(engine, result, window.parent, true)
		: result;
}

function skillChoiceAccepted(
	state: GameState,
	payload: SkillChoicePayload,
): boolean {
	const pending = pendingSkillChoiceOf(state);
	if (!pending) return false;
	if (payload.skillId !== pending.skillId) return false;
	const choice = payload.choice;
	const validOption = pending.options.some((option) => option.id === choice);
	const validDiscard =
		pending.kind === "draw_and_choose" &&
		choice.startsWith("__discard__:") &&
		pending.options.some(
			(option) => option.id === choice.slice("__discard__:".length),
		);
	return (
		validOption ||
		validDiscard ||
		(choice === "__skip__" && !!pending.allowSkip)
	);
}

function resolveSkillChoice(
	engine: GameEngine,
	state: GameState,
	payload: SkillChoicePayload,
): GameState {
	const pending = pendingSkillChoiceOf(state);
	const skillWindow = pendingSkillWindowOf(state);
	if (!pending) return state;
	const clearPendingChoice = (next: GameState): GameState =>
		withPendingSkillChoice(next, undefined);
	const discardDrawChoiceCards = (
		next: GameState,
		cardIds: readonly string[],
	): GameState => {
		if (pending.kind !== "draw_and_choose" || !pending.discardDeck) return next;
		const deck = decksOf(next)[pending.discardDeck];
		return withDecks(next, {
			...decksOf(next),
			[pending.discardDeck]: {
				...deck,
				discarded: [...deck.discarded, ...cardIds],
			},
		});
	};
	const shouldAdvanceHeroUse =
		!!pending.sourceHeroId &&
		(gameOf(state).status === "HERO_ACTION" ||
			gameOf(state).status === "BOSS_COMBAT") &&
		gameOf(state).combat?.phase === "selecting_target" &&
		gameOf(state).combat!.heroesActed.includes(pending.sourceHeroId);
	const finishChoice = (next: GameState) => {
		const afterHeroUse = shouldAdvanceHeroUse
			? advanceAfterHeroDisabledForRound(next)
			: next;
		return resumeAfterSkillWindow(engine, afterHeroUse, skillWindow);
	};
	// Apenas escolhas explicitamente opcionais podem ser dispensadas.
	if (payload.choice === "__skip__") {
		if (!pending.allowSkip) return state;
		return finishChoice(
			clearPendingChoice(
				discardDrawChoiceCards(
					state,
					pending.options.map((option) => option.id),
				),
			),
		);
	}
	if (
		pending.kind === "draw_and_choose" &&
		payload.choice.startsWith("__discard__:")
	) {
		const cardId = payload.choice.slice("__discard__:".length);
		if (!pending.options.some((option) => option.id === cardId)) return state;
		const remaining = pending.options.filter((option) => option.id !== cardId);
		const discarded = discardDrawChoiceCards(state, [cardId]);
		return remaining.length === 0
			? finishChoice(clearPendingChoice(discarded))
			: withPendingSkillChoice(discarded, { ...pending, options: remaining });
	}

	const cleared = clearPendingChoice(
		pending.kind === "draw_and_choose"
			? discardDrawChoiceCards(
					state,
					pending.options
						.filter((option) => option.id !== payload.choice)
						.map((option) => option.id),
				)
			: state,
	);

	// ── DSL choose_one path (Patch-12 Lote 3+) ───────────────────────────
	const chosenOption = pending.options.find((o) => o.id === payload.choice);
	if (chosenOption?.effect) {
		const choiceContext = pending.context ?? {
			triggeredBy: "on_use",
			skillId: pending.skillId,
			sourceHeroId: pending.sourceHeroId,
			sourceEnemyId: pending.sourceEnemyId,
			sourceCardId: pending.sourceCardId,
			sourceEntityId: pending.sourceEntityId,
			targetHeroIds: pending.targetHeroIds,
			targetEnemyIds: pending.targetEnemyIds,
		};
		const ctx = buildScriptCtx(
			engine,
			cleared,
			{
				...choiceContext,
				skillId: pending.skillId,
			},
			chosenOption.params ?? {},
		);
		return finishChoice(drainStack(engine, evaluate(chosenOption.effect, ctx)));
	}

	// ── Legacy handler continuation (type) ou script continuation (id) ──
	const def = skillById(engine, pending.skillId);
	const legacyDefType = (def as { readonly type?: string } | undefined)?.type;
	const cont =
		(legacyDefType ? engine.content.continuationOf(legacyDefType) : null) ??
		engine.content.continuationOf(pending.skillId);
	if (!cont) return finishChoice(cleared);
	return finishChoice(
		cont(
			cleared,
			{
				...(pending.context ?? { triggeredBy: "on_use" }),
				skillId: pending.skillId,
				sourceHeroId: pending.sourceHeroId,
				sourceEnemyId: pending.sourceEnemyId,
				sourceCardId: pending.sourceCardId,
				sourceEntityId: pending.sourceEntityId,
				targetHeroIds: pending.targetHeroIds,
				targetEnemyIds: pending.targetEnemyIds,
			},
			payload.choice,
		),
	);
}

export function handleSkillChoice(
	engine: GameEngine,
	state: GameState,
	payload: SkillChoicePayload,
): GameState {
	if (!skillChoiceAccepted(state, payload)) return state;
	const pending = pendingSkillChoiceOf(state)!;
	return answerPendingBy(
		state,
		{
			choice: `choice:${pending.skillId}`,
			player: PARTY_PLAYER,
			picks: [payload.choice],
		},
		(answered) => resolveSkillChoice(engine, answered, payload),
		{ choices: pendingChoicesOf(state), check: () => null },
	);
}

function interruptPending(
	state: GameState,
	payload: InterruptPayload | undefined,
) {
	const pending = pendingTriggerInterruptOf(state);
	if (!pending) return null;
	if (payload?.interruptId && payload.interruptId !== pending.id) return null;
	return pending;
}

function answerInterrupt(
	state: GameState,
	payload: InterruptPayload | undefined,
	pick: "accept" | "decline",
	resolve: (
		state: GameState,
		pending: NonNullable<ReturnType<typeof interruptPending>>,
	) => GameState,
): GameState {
	const pending = interruptPending(state, payload);
	if (!pending) return state;
	return answerPendingBy(
		state,
		{ choice: `interrupt:${pending.id}`, player: PARTY_PLAYER, picks: [pick] },
		(answered) => resolve(answered, pending),
		{ choices: pendingChoicesOf(state) },
	);
}

export function handleApplyTriggerInterrupt(
	engine: GameEngine,
	state: GameState,
	payload: InterruptPayload | undefined,
): GameState {
	return answerInterrupt(
		state,
		payload,
		"accept",
		(current, pending) => {
			const skillWindow = pendingSkillWindowOf(current);
			const applied = skillWindow
				? applySkillWindowDecision(engine, current, pending, skillWindow)
				: fireTriggerDecision(
						engine,
						withPendingTriggerInterrupt(
							withGame(current, (prevGame) => ({
								...prevGame,
								flags: {
									...gameOf(current).flags,
									[triggerDecisionFlag(pending.id)]: true,
								},
							})),
							undefined,
						),
						pending,
					);
			return log(
				skillWindow
					? resumeAfterSkillWindow(engine, applied, skillWindow)
					: resumeAfterTriggerDecision(engine, applied, pending.window),
				`Interrupção aplicada: ${skillName(engine, pending.skillId)}`,
			);
		},
	);
}

export function handleSkipTriggerInterrupt(
	engine: GameEngine,
	state: GameState,
	payload: InterruptPayload | undefined,
): GameState {
	return answerInterrupt(
		state,
		payload,
		"decline",
		(current, pending) => {
			const skillWindow = pendingSkillWindowOf(current);
			const skipped = skillWindow
				? skipSkillWindowDecision(engine, current, pending, skillWindow)
				: withPendingTriggerInterrupt(
						withGame(current, (prevGame) => ({
							...prevGame,
							flags: {
								...gameOf(current).flags,
								[triggerDecisionFlag(pending.id)]: true,
							},
						})),
						undefined,
					);
			return log(
				skillWindow
					? resumeAfterSkillWindow(engine, skipped, skillWindow)
					: resumeAfterTriggerDecision(engine, skipped, pending.window),
				`Interrupção ignorada: ${skillName(engine, pending.skillId)}`,
			);
		},
	);
}

export function handleSelectTarget(
	engine: GameEngine,
	state: GameState,
	targetId: string,
): GameState {
	const pending = pendingSkillTargetOf(state);
	if (!pending) return state;
	if (!pending.candidates.some((candidate) => candidate.id === targetId)) {
		return handleSelectSkillTarget(engine, state, targetId);
	}
	return answerPendingBy(
		state,
		{
			choice: `target:${pending.skillId}`,
			player: PARTY_PLAYER,
			picks: [targetId],
		},
		(answered) => handleSelectSkillTarget(engine, answered, targetId),
		{ choices: pendingChoicesOf(state) },
	);
}

export const responseHandler: GameHandler = {
	id: "responses",
	phases: "*",
	exclusive: true,
	actions: [
		"SKILL_CHOICE",
		"SELECT_SKILL_TARGET",
		"CANCEL_SKILL_TARGET",
		"APPLY_TRIGGER_INTERRUPT",
		"SKIP_TRIGGER_INTERRUPT",
	],
	blocks(state, action) {
		if (
			pendingTriggerInterruptOf(state) &&
			action.type !== "APPLY_TRIGGER_INTERRUPT" &&
			action.type !== "SKIP_TRIGGER_INTERRUPT"
		) {
			return true;
		}
		if (gameOf(state).combat?.pendingDiceSelection)
			return action.type !== "SELECT_DIE" && action.type !== "CANCEL_DICE_SELECTION";
		return (
			!!pendingSkillTargetOf(state) &&
			action.type !== "SELECT_SKILL_TARGET" &&
			action.type !== "CANCEL_SKILL_TARGET"
		);
	},
	legalActions(state) {
		const interrupt = pendingTriggerInterruptOf(state);
		if (interrupt) {
			return [
				{
					type: "APPLY_TRIGGER_INTERRUPT",
					payload: { interruptId: interrupt.id },
				},
				{
					type: "SKIP_TRIGGER_INTERRUPT",
					payload: { interruptId: interrupt.id },
				},
			];
		}
		const choice = pendingSkillChoiceOf(state);
		if (choice) {
			return choice.options.map((option) => ({
				type: "SKILL_CHOICE" as const,
				payload: { skillId: choice.skillId, choice: option.id },
			}));
		}
		const target = pendingSkillTargetOf(state);
		if (target) {
			return [
				...target.candidates.map((candidate) => ({
					type: "SELECT_SKILL_TARGET" as const,
					payload: { targetId: candidate.id },
				})),
				{ type: "CANCEL_SKILL_TARGET" as const },
			];
		}
		return [];
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "SKILL_CHOICE":
				return handleSkillChoice(engine, state, action.payload);
			case "SELECT_SKILL_TARGET":
				return handleSelectTarget(engine, state, action.payload.targetId);
			case "CANCEL_SKILL_TARGET":
				return handleCancelSkillTarget(state);
			case "APPLY_TRIGGER_INTERRUPT":
				return handleApplyTriggerInterrupt(engine, state, action.payload);
			case "SKIP_TRIGGER_INTERRUPT":
				return handleSkipTriggerInterrupt(engine, state, action.payload);
			default:
				return state;
		}
	},
};

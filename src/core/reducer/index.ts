// Reducer raiz. Despacha cada action para o handler correto.
// Nunca muta o estado — sempre retorna novo objeto.

import type { Action } from "../actions/types";
import { getSkillName } from "../data/skillLocale";
import { drainStack } from "../effects/resolver";
import type { GameState } from "../state/gameState";
import {
	buildBossRoll,
	handleBossResolveAttack,
	handleRevealBoss,
} from "./boss";
import {
	handleCancelHeroSelection,
	handleCheckCombatEnd,
	handleChooseHero,
	handleChooseHeroForRound,
	handleChooseTarget,
	handleDeclareFlee,
	handleDirectDamage,
	handlePassHeroAction,
	handleResolveAttack,
	handleRollDice,
	handleSelectDie,
	handleStartCombat,
	handleUseItem,
	handleUsePower,
	handleUseSkill,
	handleSelectSkillTarget,
	handleCancelSkillTarget,
	advanceAfterEnemyDefeat,
	advanceAfterHeroDisabledForRound,
} from "./combat";
import {
	handleCheckBossCondition,
	handleContinueExplorationAfterBossOffer,
	handleChoosePath,
	handleDiscardPaths,
	discardFromDungeonDeck,
	resumeDungeonAdvance,
	handleOpenPaths,
	handleResolveRoomEffect,
	handleRestartDungeon,
	handleRevealRoom,
	handleSpawnEnemies,
} from "./exploration";
import {
	continueRewardsAfterRoomWin,
	finishGrantRewards,
	handleChooseArtifactBearer,
	handleChooseItemDestination,
	handleGainXp,
	handleGrantRewards,
	handleInvAssignArtifact,
	handleInvAssignItem,
	handleInvDescartarMesa,
	handleInvMove,
	handleInvSetBearer,
	handleOpenPathsFromXpPhase,
	handleSpendXp,
} from "./reward";
import "../skills/handlers/index"; // registra todos os handlers no boot
import { assertTransition } from "../rules/stateMachine";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "../skills/dsl/evaluate";
import { lookupSkillById } from "../skills/lookup";
import { getContinuation } from "../skills/registry";
import {
	fireTriggerDecision,
	markSkillGuardUsed,
	triggerDecisionFlag,
} from "../triggers/engine";
import { voluntarySkillConsumesUse } from "../skills/useSkill";
import {
	applySkillWindowDecision,
	resolveSkillWindow,
	skipSkillWindowDecision,
	type PendingSkillWindow,
} from "../skills/resolveSkillWindow";
import { handleStartGame } from "./setup";
import { applyDamage } from "../systems/damageSystem";
import { log } from "./utils";

function applyAndValidate(
	prev: GameState,
	action: Action,
	next: GameState,
): GameState {
	// START_GAME é uma ação de reset — pode transitar de qualquer estado.
	if (action.type === "START_GAME") return next;
	if (prev.status !== next.status) {
		assertTransition(prev.status, next.status);
	}
	return next;
}

function resumeAfterTriggerDecision(
	state: GameState,
	pendingWindow: string,
): GameState {
	if (state.pendingTriggerInterrupt) return state;
	if (pendingWindow === "before_attack_roll" && state.status === "ROLL_DICE") {
		return handleRollDice(state);
	}
	return state;
}

function resumeAfterSkillWindow(
	state: GameState,
	window: PendingSkillWindow | undefined,
): GameState {
	if (
		!window ||
		state.pendingTriggerInterrupt ||
		state.pendingSkillChoice ||
		state.pendingSkillTarget
	) {
		return state;
	}
	const resumedWindow = {
		...state,
		pendingSkillWindow: undefined,
	};
	const continued = state.pendingSkillWindow
		? resolveSkillWindow(resumedWindow, window)
		: resumedWindow;
	if (
		continued.pendingTriggerInterrupt ||
		continued.pendingSkillChoice ||
		continued.pendingSkillTarget
	) {
		return continued;
	}
	switch (window.resume.type) {
		case "roll_dice":
			return handleRollDice(continued);
		case "resolve_attack":
			return handleResolveAttack(continued);
		case "continue_rewards_after_room_win":
			return continueRewardsAfterRoomWin(continued);
		case "finish_rewards":
			return finishGrantRewards(continued);
		case "apply_damage":
			return advanceAfterEnemyDefeat(
				applyDamage(continued, window.resume.targetId, window.resume.amount, {
					sourceId: window.resume.sourceId,
					damageType: window.resume.damageType,
					skipWouldBeDestroyed: true,
				}),
			);
		case "advance_dungeon":
			return resumeDungeonAdvance(continued, window.resume.exits);
		case "discard_dungeon":
			return discardFromDungeonDeck(
				continued,
				window.resume.count,
				window.resume.reason,
				true,
			);
		case "none":
			return advanceAfterEnemyDefeat(continued);
	}
}

function dispatch(state: GameState, action: Action): GameState {
	if (
		state.pendingTriggerInterrupt &&
		action.type !== "APPLY_TRIGGER_INTERRUPT" &&
		action.type !== "SKIP_TRIGGER_INTERRUPT"
	) {
		return state;
	}

	if (
		state.pendingSkillTarget &&
		action.type !== "SELECT_SKILL_TARGET" &&
		action.type !== "CANCEL_SKILL_TARGET"
	) {
		return state;
	}

	switch (action.type) {
		case "START_GAME":
			return handleStartGame(state, action.payload);

		case "REVEAL_ROOM":
			return handleRevealRoom(state);

		case "RESOLVE_ROOM_EFFECT":
			return handleResolveRoomEffect(state);

		case "SPAWN_ENEMIES":
			return handleSpawnEnemies(state);

		case "START_COMBAT":
			return handleStartCombat(state);

		case "CHOOSE_HERO":
			return handleChooseHero(state, action.payload?.heroId);

		case "CHOOSE_HERO_FOR_ROUND":
			return handleChooseHeroForRound(state, action.payload.heroId);

		case "PASS_HERO_ACTION":
			return handlePassHeroAction(state, action.payload.heroId);

		case "CANCEL_HERO_SELECTION":
			return handleCancelHeroSelection(state);

		case "CHOOSE_TARGET":
			return handleChooseTarget(
				state,
				action.payload.heroId,
				action.payload.enemyId,
			);

		case "ROLL_DICE": {
			if (state.status === "BOSS_COMBAT") {
				// Boss: usa buildBossRoll e vai direto para RESOLVE_ATTACK
				const bossResult = buildBossRoll(state);
				if (!bossResult) return state;
				const { roll, nextState } = bossResult;
				return {
					...nextState,
					status: "RESOLVE_ATTACK",
					combat: nextState.combat
						? { ...nextState.combat, lastRoll: roll }
						: null,
				};
			}
			return handleRollDice(state);
		}

		case "RESOLVE_ATTACK":
			if (
				state.status === "BOSS_COMBAT" ||
				(state.status === "RESOLVE_ATTACK" &&
					state.activeEnemies.some((e) => e.id === "boss"))
			) {
				return handleBossResolveAttack(state);
			}
			return handleResolveAttack(state);

		case "APPLY_DAMAGE":
			// Usado por efeitos externos (ex: sala). O reducer de combate aplica dano diretamente.
			return state;

		case "CHECK_COMBAT_END":
			return handleCheckCombatEnd(state);

		case "DIRECT_DAMAGE":
			return handleDirectDamage(state);

		case "USE_ITEM":
			return handleUseItem(
				state,
				action.payload.itemId,
				action.payload.heroId,
				action.payload.targetHeroId,
				action.payload.targetEnemyId,
			);

		case "USE_POWER":
			return handleUsePower(state, action.payload.heroId);

		case "GRANT_REWARDS":
			return handleGrantRewards(state);

		case "CHOOSE_ITEM_DESTINATION":
			return handleChooseItemDestination(
				state,
				action.payload.heroId,
				action.payload.destination,
			);

		case "CHOOSE_ARTIFACT_BEARER":
			return handleChooseArtifactBearer(state, action.payload.heroId);

		// ── Inventário do grupo (Patch 4) ─────────────────────────────────────
		case "INV_MOVE":
			return handleInvMove(
				state,
				action.payload.itemId,
				action.payload.from,
				action.payload.to,
			);

		case "INV_ASSIGN_ITEM":
			return handleInvAssignItem(
				state,
				action.payload.itemId,
				action.payload.heroId,
				action.payload.destination,
			);

		case "INV_ASSIGN_ARTIFACT":
			return handleInvAssignArtifact(
				state,
				action.payload.artifactId,
				action.payload.vagaIndex,
				action.payload.heroId,
			);

		case "INV_SET_BEARER":
			return handleInvSetBearer(
				state,
				action.payload.vagaIndex,
				action.payload.heroId,
			);

		case "INV_DISCARD_MESA":
			return handleInvDescartarMesa(state);

		case "USE_SKILL":
			return handleUseSkill(state, action.payload);

		case "SELECT_SKILL_TARGET":
			return handleSelectSkillTarget(state, action.payload.targetId);

		case "CANCEL_SKILL_TARGET":
			return handleCancelSkillTarget(state);

		case "SKILL_CHOICE": {
			const pending = state.pendingSkillChoice;
			const skillWindow = state.pendingSkillWindow;
			if (!pending) return state;
			if (action.payload.skillId !== pending.skillId) return state;
			const choice = action.payload.choice;
			const validOption = pending.options.some(
				(option) => option.id === choice,
			);
			const validDiscard =
				pending.kind === "draw_and_choose" &&
				choice.startsWith("__discard__:") &&
				pending.options.some(
					(option) => option.id === choice.slice("__discard__:".length),
				);
			if (
				!validOption &&
				!validDiscard &&
				!(choice === "__skip__" && pending.allowSkip)
			)
				return state;
			const clearPendingChoice = (next: GameState): GameState => ({
				...next,
				pendingSkillChoice: undefined,
			});
			const discardDrawChoiceCards = (
				next: GameState,
				cardIds: readonly string[],
			): GameState => {
				if (pending.kind !== "draw_and_choose" || !pending.discardDeck)
					return next;
				const deck = next.decks[pending.discardDeck];
				return {
					...next,
					decks: {
						...next.decks,
						[pending.discardDeck]: {
							...deck,
							discarded: [...deck.discarded, ...cardIds],
						},
					},
				};
			};
			const shouldAdvanceHeroUse =
				!!pending.sourceHeroId &&
				(state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") &&
				state.combat?.phase === "selecting_target" &&
				state.combat.heroesActed.includes(pending.sourceHeroId);
			const finishChoice = (next: GameState) => {
				const afterHeroUse = shouldAdvanceHeroUse
					? advanceAfterHeroDisabledForRound(next)
					: next;
				return resumeAfterSkillWindow(afterHeroUse, skillWindow);
			};
			// Apenas escolhas explicitamente opcionais podem ser dispensadas.
			if (action.payload.choice === "__skip__") {
				if (!pending.allowSkip) return state;
				const definition = lookupSkillById(pending.skillId);
				const afterSkipUse =
					definition &&
					pending.context?.triggeredBy === "on_use" &&
					voluntarySkillConsumesUse(definition)
						? markSkillGuardUsed(state, definition, pending.sourceHeroId)
						: state;
				return finishChoice(
					clearPendingChoice(
						discardDrawChoiceCards(
							afterSkipUse,
							pending.options.map((option) => option.id),
						),
					),
				);
			}
			if (
				pending.kind === "draw_and_choose" &&
				action.payload.choice.startsWith("__discard__:")
			) {
				const cardId = action.payload.choice.slice("__discard__:".length);
				if (!pending.options.some((option) => option.id === cardId))
					return state;
				const remaining = pending.options.filter(
					(option) => option.id !== cardId,
				);
				const discarded = discardDrawChoiceCards(state, [cardId]);
				return remaining.length === 0
					? finishChoice(clearPendingChoice(discarded))
					: {
							...discarded,
							pendingSkillChoice: { ...pending, options: remaining },
						};
			}

			const cleared = clearPendingChoice(
				pending.kind === "draw_and_choose"
					? discardDrawChoiceCards(
							state,
							pending.options
								.filter((option) => option.id !== action.payload.choice)
								.map((option) => option.id),
						)
					: state,
			);

			// ── DSL choose_one path (Patch-12 Lote 3+) ───────────────────────────
			const chosenOption = pending.options.find(
				(o) => o.id === action.payload.choice,
			);
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
					cleared,
					{
						...choiceContext,
						skillId: pending.skillId,
					},
					chosenOption.params ?? {},
				);
				return finishChoice(drainStack(evaluate(chosenOption.effect, ctx)));
			}

			// ── Legacy handler continuation (type) ou script continuation (id) ──
			const def = lookupSkillById(pending.skillId);
			const legacyDefType = (def as { readonly type?: string } | undefined)
				?.type;
			const cont =
				getContinuation(legacyDefType ?? "") ??
				getContinuation(pending.skillId);
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
					action.payload.choice,
				),
			);
		}

		case "APPLY_TRIGGER_INTERRUPT": {
			const pending = state.pendingTriggerInterrupt;
			if (!pending) return state;
			const skillWindow = state.pendingSkillWindow;
			if (
				action.payload?.interruptId &&
				action.payload.interruptId !== pending.id
			) {
				return state;
			}

			const applied = skillWindow
				? applySkillWindowDecision(state, pending, skillWindow)
				: fireTriggerDecision(
						{
							...state,
							pendingTriggerInterrupt: undefined,
							flags: {
								...state.flags,
								[triggerDecisionFlag(pending.id)]: true,
							},
						},
						pending,
					);
			return log(
				skillWindow
					? resumeAfterSkillWindow(applied, skillWindow)
					: resumeAfterTriggerDecision(applied, pending.window),
				`Interrupção aplicada: ${getSkillName(pending.skillId)}`,
			);
		}

		case "SKIP_TRIGGER_INTERRUPT": {
			const pending = state.pendingTriggerInterrupt;
			if (!pending) return state;
			const skillWindow = state.pendingSkillWindow;
			if (
				action.payload?.interruptId &&
				action.payload.interruptId !== pending.id
			) {
				return state;
			}

			const skipped = skillWindow
				? skipSkillWindowDecision(state, pending, skillWindow)
				: {
						...state,
						pendingTriggerInterrupt: undefined,
						flags: {
							...state.flags,
							[triggerDecisionFlag(pending.id)]: true,
						},
					};

			return log(
				skillWindow
					? resumeAfterSkillWindow(skipped, skillWindow)
					: resumeAfterTriggerDecision(skipped, pending.window),
				`Interrupção ignorada: ${getSkillName(pending.skillId)}`,
			);
		}

		case "DUNGEON_EXHAUSTED":
			return { ...state, status: "DUNGEON_EXHAUSTED" };

		case "GAIN_XP":
			return handleGainXp(state, action.payload.amount);

		case "SPEND_XP":
			return handleSpendXp(state, action.payload.option, action.payload.heroId);

		case "OPEN_PATHS":
			if (state.status === "XP_SPEND_PHASE")
				return handleOpenPathsFromXpPhase(state);
			return handleOpenPaths(state);

		case "CHOOSE_PATH":
			return handleChoosePath(state, action.payload.cardId);

		case "DISCARD_PATHS":
			return handleDiscardPaths(state);

		case "CHECK_BOSS_CONDITION":
			return handleCheckBossCondition(state);

		case "REVEAL_BOSS":
			return handleRevealBoss(state);

		case "CONTINUE_EXPLORATION":
			return handleContinueExplorationAfterBossOffer(state);

		case "START_BOSS_COMBAT":
			return { ...state, status: "BOSS_COMBAT" };

		case "SELECT_DIE":
			return handleSelectDie(
				state,
				action.payload.side,
				action.payload.index,
				action.payload.value,
			);

		case "DECLARE_FLEE":
			return handleDeclareFlee(state, action.payload.heroId);

		case "RESTART_DUNGEON":
			return handleRestartDungeon(state, action.payload.keepEquipment);

		case "VICTORY":
			return { ...state, status: "VICTORY", bossDefeated: true };

		case "DEFEAT":
			return { ...state, status: "DEFEAT" };

		default:
			return state;
	}
}

// reducerCore: executa dispatch + valida transição + drena effect stack.
export function reducerCore(state: GameState, action: Action): GameState {
	const dispatched = dispatch(state, action);
	const validated = applyAndValidate(state, action, dispatched);
	// Drenar a stack ao fim de cada action — toda cadeia de efeitos resolve aqui.
	return drainStack(validated);
}

export function reducer(state: GameState, action: Action): GameState {
	const next = reducerCore(state, action);
	if (
		next === state &&
		(action.type === "INV_MOVE" ||
			action.type === "INV_ASSIGN_ITEM" ||
			action.type === "CHOOSE_ITEM_DESTINATION")
	)
		return state;
	const newEntry = { seq: 0, action };
	if (action.type === "START_GAME") {
		return { ...next, actionLog: [newEntry] };
	}
	const seq = next.actionLog.length;
	return {
		...next,
		actionLog: [...next.actionLog, { seq, action }],
	};
}

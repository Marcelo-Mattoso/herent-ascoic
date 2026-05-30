// Reducer raiz. Despacha cada action para o handler correto.
// Nunca muta o estado — sempre retorna novo objeto.

import type { Action } from "../actions/types";
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
} from "./combat";
import {
	handleCheckBossCondition,
	handleChoosePath,
	handleDiscardPaths,
	handleOpenPaths,
	handleResolveRoomEffect,
	handleRestartDungeon,
	handleRevealRoom,
	handleSpawnEnemies,
} from "./exploration";
import {
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
import { fireOnUseSkill } from "../skills/useSkill";
import { handleStartGame } from "./setup";

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

function dispatch(state: GameState, action: Action): GameState {
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
				action.payload.itemName,
				action.payload.heroId,
				action.payload.targetHeroId,
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
				action.payload.itemName,
				action.payload.from,
				action.payload.to,
			);

		case "INV_ASSIGN_ITEM":
			return handleInvAssignItem(
				state,
				action.payload.itemName,
				action.payload.heroId,
				action.payload.destination,
			);

		case "INV_ASSIGN_ARTIFACT":
			return handleInvAssignArtifact(
				state,
				action.payload.artifactName,
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
			return fireOnUseSkill(state, action.payload);

		case "SKILL_CHOICE": {
			const pending = state.pendingSkillChoice;
			if (!pending) return state;
			const cleared = { ...state, pendingSkillChoice: undefined };

			// ── DSL choose_one path (Patch-12 Lote 3+) ───────────────────────────
			const chosenOption = pending.options.find(
				(o) => o.id === action.payload.choice,
			);
			if (chosenOption?.effect) {
				const ctx = buildScriptCtx(
					cleared,
					{
						triggeredBy: "on_use",
						skillId: pending.skillId,
						sourceHeroId: pending.sourceHeroId,
						targetHeroIds: pending.targetHeroIds,
						targetEnemyIds: pending.targetEnemyIds,
					},
					{},
				);
				return drainStack(evaluate(chosenOption.effect, ctx));
			}

			// ── Legacy handler continuation (type) ou script continuation (id) ──
			const def = lookupSkillById(pending.skillId);
			const cont =
				getContinuation(def?.type ?? "") ??
				getContinuation(pending.skillId);
			if (!cont) return cleared;
			return cont(
				cleared,
				{
					triggeredBy: "on_use",
					skillId: pending.skillId,
					sourceHeroId: pending.sourceHeroId,
				},
				action.payload.choice,
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
			return handleChoosePath(state, action.payload.cardName);

		case "DISCARD_PATHS":
			return handleDiscardPaths(state);

		case "CHECK_BOSS_CONDITION":
			return handleCheckBossCondition(state);

		case "REVEAL_BOSS":
			return handleRevealBoss(state);

		case "START_BOSS_COMBAT":
			return { ...state, status: "BOSS_COMBAT" };

		case "SELECT_DIE":
			return handleSelectDie(state, action.payload.side, action.payload.index);

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

// Reducer raiz. Despacha cada action para o handler correto.
// Nunca muta o estado — sempre retorna novo objeto.

import type { Action } from "../actions/types";
import type { GameState } from "../state/gameState";
import {
	buildBossRoll,
	handleBossResolveAttack,
	handleRevealBoss,
} from "./boss";
import {
	handleCheckCombatEnd,
	handleChooseHero,
	handleChooseTarget,
	handleDirectDamage,
	handleResolveAttack,
	handleRollDice,
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
	handleRevealRoom,
	handleSpawnEnemies,
} from "./exploration";
import {
	handleChooseArtifactBearer,
	handleChooseItemDestination,
	handleGainXp,
	handleGrantRewards,
	handleOpenPathsFromXpPhase,
	handleSpendXp,
} from "./reward";
import { handleStartGame } from "./setup";

export function reducer(state: GameState, action: Action): GameState {
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

		case "CHOOSE_TARGET":
			return handleChooseTarget(
				state,
				action.payload.heroId,
				action.payload.enemyId,
			);

		case "ROLL_DICE": {
			if (state.status === "BOSS_COMBAT") {
				// Boss: usa buildBossRoll e vai direto para RESOLVE_ATTACK
				const roll = buildBossRoll(state);
				if (!roll) return state;
				return {
					...state,
					status: "RESOLVE_ATTACK",
					combat: state.combat ? { ...state.combat, lastRoll: roll } : null,
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

		case "VICTORY":
			return { ...state, status: "VICTORY", bossDefeated: true };

		case "DEFEAT":
			return { ...state, status: "DEFEAT" };

		default:
			return state;
	}
}

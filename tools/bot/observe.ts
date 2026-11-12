import type { Action } from "@/core/actions/types";
import type { GameEngine } from "@/core/gameEngine";
import { skillById } from "@/core/gameEngine";
import { legalActions } from "@/core/legalActions";
import {
	type AbilityActionView,
	projectAbilityActionsForHero,
} from "@/core/projection/abilityActions";
import { type PlayerView, playerView } from "@/core/projection/playerView";
import type { GameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";
import { hasDiceChangeEffect } from "@/core/rules/diceReactions";

/** O que um jogador pode saber: a tela e as jogadas disponíveis, nunca o estado cru. */
export interface BotObservation {
	readonly view: PlayerView;
	readonly actions: readonly Action[];
	readonly abilities: Readonly<Record<string, readonly AbilityMove[]>>;
}

export type AbilityMove = AbilityActionView & {
	/** O que a carta diz que faz, como um jogador lendo o texto. */
	readonly heals: boolean;
	readonly modifiesDice: boolean;
};

/** Troca as jogadas de dados pelas que a interface despacha, com a recuperação determinística da seed. */
function asPlayedByUi(state: GameState, actions: readonly Action[]): Action[] {
	const { status, combat } = gameOf(state);
	if (combat?.pendingDiceSelection) {
		const choices = actions.filter((action) =>
			action.type === "SELECT_DIE" || action.type === "CANCEL_DICE_SELECTION");
		return choices.length ? choices : [{ type: "CANCEL_DICE_SELECTION" }];
	}
	const pending = combat?.pendingPhysicalRoll;
	const undecided = actions.some(
		(action) =>
			action.type === "APPLY_TRIGGER_INTERRUPT" ||
			action.type === "SKILL_CHOICE" ||
			action.type === "SELECT_SKILL_TARGET",
	);
	if (undecided) return [...actions];
	if (pending) {
		return [
			{
				type: "CONFIRM_DICE_ROLL",
				payload: {
					rollId: pending.id,
					heroId: pending.heroId,
					enemyId: pending.enemyId,
					heroResults: [...pending.fallbackHeroResults],
					enemyResults: [...pending.fallbackEnemyResults],
					source: "fallback",
				},
			},
		];
	}
	if (status === "ROLL_DICE") return [{ type: "PREPARE_PHYSICAL_ROLL" }];
	if (status === "DIRECT_DAMAGE") return [{ type: "PREPARE_EXTRA_ATTACK" }];
	if (status === "BOSS_COMBAT" && combat?.pairs.length && !combat.lastRoll) {
		return [{ type: "PREPARE_PHYSICAL_ROLL" }];
	}
	return [...actions];
}

function healsByText(engine: GameEngine, abilityId: string): boolean {
	const effect = JSON.stringify(skillById(engine, abilityId)?.effect ?? []);
	return effect.includes('"i_heal"') || effect.includes('"i_full_heal"');
}

export function observe(engine: GameEngine, state: GameState): BotObservation {
	const view = playerView(engine, state);
	return {
		view,
		actions: asPlayedByUi(state, legalActions(engine, state)),
		abilities: Object.fromEntries(
			view.heroes.map((hero) => [
				hero.id,
				projectAbilityActionsForHero(engine, state, hero.id).map((ability) => ({
					...ability,
					heals: healsByText(engine, ability.abilityId),
					modifiesDice: hasDiceChangeEffect(skillById(engine, ability.abilityId)?.effect),
				})),
			]),
		),
	};
}

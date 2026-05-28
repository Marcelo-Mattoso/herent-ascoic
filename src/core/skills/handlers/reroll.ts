// Reroll interativo: configura pendingDiceSelection para o jogador escolher um dado.
// O jogador clica no dado → SELECT_DIE → reducer rerrola e recalcula total.
// Cobre: habilidade-runa-menor (Cajado das Runas Rubras) — rerrola dado com valor 1.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleReroll(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!state.combat?.lastRoll || !ctx.sourceHeroId || !ctx.skillId) return state;
	const roll = state.combat.lastRoll;

	// die_with_value_1: apenas dados com valor = 1 são elegíveis
	const eligibleHero = roll.heroResults.some((v) => v === 1);
	const eligibleEnemy = roll.enemyResults.some((v) => v === 1);

	if (!eligibleHero && !eligibleEnemy) {
		return log(state, "Nenhum dado com valor 1 para rerolar.");
	}

	return {
		...state,
		combat: {
			...state.combat,
			pendingDiceSelection: {
				skillId: ctx.skillId,
				heroId: ctx.sourceHeroId,
				side: "hero",
				filter: { value: 1 },
				action: "reroll",
			},
		},
	};
}

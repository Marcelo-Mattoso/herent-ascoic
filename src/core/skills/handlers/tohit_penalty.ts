// tohit_penalty: aplica penalidade de acerto ao herói que ataca a criatura-fonte.
// Disparado em before_attack. Consumido em collectHeroBonuses (combat.ts).
// Cobre: habilidade-calor-escaldante, habilidade-corpo-gelatinoso, habilidade-prisao-das-correntes.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleTohitPenalty(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId || !state.combat) return state;
	const penalty = parseNumber(value) ?? 1;
	const prev = state.combat.tohitPenaltyByHero[ctx.sourceHeroId] ?? 0;
	return log(
		{
			...state,
			combat: {
				...state.combat,
				tohitPenaltyByHero: {
					...state.combat.tohitPenaltyByHero,
					[ctx.sourceHeroId]: prev + penalty,
				},
			},
		},
		`Penalidade de -${penalty} no acerto de ${ctx.sourceHeroId}.`,
	);
}

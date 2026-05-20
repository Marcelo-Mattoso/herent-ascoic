// token: Eco Profundo do Véu (Necromante power).
// Uma vez por jogo, ao derrotar uma criatura: guarda 1 Eco maior.
// Gaste o Eco: +3 no total de acerto, reduz 2 de dano sofrido ou olha 2 cartas do deck inimigo.
// value = "1/3/2/2" → [ecoCost, tohit, damageReduction, deckLook].

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleToken(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	// value = "1/3/2/2" — usado pela UI para exibir opções do Eco
	if (!ctx.sourceHeroId || !state.combat) return state;

	const heroId = ctx.sourceHeroId;
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;

	// Trigger: on_destroy_creature_with_attack — concede o Eco
	const currentEco = state.combat.ecoTokens[heroId] ?? 0;
	return log(
		{
			...state,
			combat: {
				...state.combat,
				ecoTokens: { ...state.combat.ecoTokens, [heroId]: currentEco + 1 },
			},
		},
		`Necromante: Eco Profundo — 1 Eco ganho (total: ${currentEco + 1}).`,
	);
}

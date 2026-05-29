// diceFix: Runa Suprema das Fendas (Mago power) e Runa Perfeita.
// Depois de qualquer rolagem: transforma 1 dado aliado em 6 (ou inimigo em 1).
// value = "6/1" → set_to: 6 para dado aliado.
// Abre pendingDiceSelection para o jogador escolher qual dado transformar.

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";

export function handleDiceFix(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!state.combat?.lastRoll || !ctx.sourceHeroId || !ctx.skillId)
		return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				pendingDiceSelection: {
					skillId: ctx.skillId,
					heroId: ctx.sourceHeroId,
					side: "any",
					action: "set_to",
					setToValue: 6,
				},
			},
		},
		`${hero.cardName}: Runa Suprema — escolha 1 dado aliado para transformar em 6.`,
	);
}

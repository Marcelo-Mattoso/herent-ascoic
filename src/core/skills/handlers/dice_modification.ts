// dice_modification: Runa das Fendas (Mago skill).
// Depois de rolar, altere 1 dado aliado em até `value` (sem passar de 6 nem ficar abaixo de 1).
// Por ser interativo (jogador escolhe qual dado), emite uma flag no estado
// para a UI saber que está pendente — a efetivação ocorre quando o jogador confirma.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleDiceModification(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	// A modificação real do dado ocorre quando o jogador escolhe via USE_SKILL.
	// Aqui apenas sinalizamos que a habilidade está disponível (log informativo).
	if (!ctx.sourceHeroId) return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;
	return log(state, `${hero.cardName}: Runa das Fendas disponível — altere 1 dado em até ${value}.`);
}

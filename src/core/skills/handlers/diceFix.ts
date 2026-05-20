// diceFix: Runa Suprema das Fendas (Mago power).
// Depois de qualquer rolagem: transforma 1 dado aliado em 6 ou 1 dado inimigo em 1.
// value = "6/1".
// Por ser interativo (o jogador escolhe qual dado), o handler apenas loga a disponibilidade.
// A efetivação ocorre via USE_SKILL com o índice do dado escolhido.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleDiceFix(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId) return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;
	return log(
		state,
		`${hero.cardName}: Runa Suprema disponível — transforme 1 dado aliado em 6 ou inimigo em 1.`,
	);
}

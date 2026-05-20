// mark_and_tohit: Marca da Presa (Caçador skill).
// No início de cada combate, escolhe 1 criatura como Presa.
// Contra ela, recebe +value no bônus de acerto.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleMarkAndTohit(
	state: GameState,
	_ctx: SkillContext,
	value: number | string | null,
): GameState {
	const bonus = parseNumber(value);
	if (!bonus || bonus <= 0) return state;
	if (!state.combat) return state;

	// Se já há uma presa definida, apenas loga.
	if (state.combat.prey) {
		return log(state, `Caçador: presa já marcada (${state.combat.prey}).`);
	}

	// Auto-seleciona o único inimigo ativo, ou aguarda seleção do jogador.
	const activeEnemies = state.activeEnemies.filter((e) => e.status === "active");
	if (activeEnemies.length === 0) return state;

	// Com 1 inimigo: auto-seleciona.
	if (activeEnemies.length === 1) {
		const prey = activeEnemies[0]!;
		return log(
			{
				...state,
				combat: { ...state.combat, prey: prey.id },
			},
			`Caçador marcou ${prey.cardName} como Presa (+${bonus} no acerto).`,
		);
	}

	// Com múltiplos: registra que precisa de seleção (jogador usa USE_SKILL para confirmar).
	return log(state, `Caçador: escolha a Presa entre os inimigos ativos (+${bonus} no acerto).`);
}

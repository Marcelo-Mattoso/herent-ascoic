// tohit: bônus permanente de acerto enquanto item está equipado (while_equipped).
// Registrado como modificador passivo — consultado antes de rolar.
// Para simplificar no MVP1: loga disponibilidade (aplicação é via collectHeroBonuses).

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";

export function handleTohit(
	state: GameState,
	_ctx: SkillContext,
	_value: number | string | null,
): GameState {
	// Bônus passivo while_equipped — coletado em collectHeroBonuses via skills engine.
	// Sem mutação de estado necessária aqui.
	return state;
}

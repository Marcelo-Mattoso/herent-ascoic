// noop: handler para tipos ainda não implementados.
// Loga uma mensagem mas não altera o estado.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleNoop(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	return log(state, `[SKILL NÃO IMPLEMENTADA: ${ctx.skillId ?? "?"}]`);
}

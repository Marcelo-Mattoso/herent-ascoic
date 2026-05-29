// noop: handler para tipos ainda não implementados.
// Loga uma mensagem mas não altera o estado.

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";

export function handleNoop(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	return log(state, `[SKILL NÃO IMPLEMENTADA: ${ctx.skillId ?? "?"}]`);
}

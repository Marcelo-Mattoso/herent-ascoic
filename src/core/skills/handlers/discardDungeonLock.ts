// discardDungeonLock: cancela a prevenção de descarte de dungeon (Caminho Preservado).
// Liga state.flags.discardDungeonLocked = true enquanto a fonte estiver ativa.
// Cobre: habilidade-corrupcao-de-caminho.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleDiscardDungeonLock(
	state: GameState,
	_ctx: SkillContext,
	_value: number | string | null,
): GameState {
	return log(
		{
			...state,
			flags: { ...state.flags, discardDungeonLocked: true },
		},
		"Corrupção de Caminho: prevenção de descarte de dungeon bloqueada.",
	);
}

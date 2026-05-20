// Impede tentativa de fuga de heróis nesta sala.
// Por ora registrado como noop — a UI desabilita o botão se flee_block estiver ativo.
// A flag state.flags.fleeBlocked seria checada em handleDeclareFlee quando implementado.
import type { GameState } from "../../state/gameState";
import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";

export function handleFleeBlock(
	state: GameState,
	_ctx: SkillContext,
	_value: number | null,
): GameState {
	return log(
		{ ...state, flags: { ...state.flags, fleeBlocked: true } },
		"Fuga bloqueada nesta sala.",
	);
}

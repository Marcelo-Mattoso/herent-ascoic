// damage_bonus_duration: Fúria Rubra Poderosa (Bárbaro power).
// Ao usar Fúria Rubra, o dano adicional dura até o fim do combate (não apenas 1 ataque).
// Trigger: once_per_game_on_use_furia_rubra (custom).
// Implementação: marca uma flag no combat state que o handler damage_bonus verifica.

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";

export function handleDamageBonusDuration(
	state: GameState,
	_ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!state.combat) return state;
	return log(
		{
			...state,
			combat: {
				...state.combat,
				// Flag que damage_bonus handler usa para manter bônus por toda a sala
				temporaryEffects: [
					...state.combat.temporaryEffects,
					{
						id: "furia-rubra-duracao",
						description: "Fúria Rubra dura todo o combate",
						roundsLeft: -1,
					},
				],
			},
		},
		"Bárbaro: Fúria Rubra Poderosa — dano adicional dura o combate inteiro.",
	);
}

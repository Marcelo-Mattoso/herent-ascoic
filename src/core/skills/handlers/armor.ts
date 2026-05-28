// armor: Guarda do Bastião (Guerreiro skill) e Guarda Inquebrável (Guerreiro power).
// Reduz `value` do dano sofrido por heróis alvo.
// Quando trigger=once_per_game_until_end_of_round: aplica damageReduction a todos os heróis até fim da rodada.
// Quando trigger=on_damage_taken: reduz o dano do ctx diretamente (stateless — modifica valor no ctx futuro).

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleArmor(
	state: GameState,
	_ctx: SkillContext,
	value: number | string | null,
): GameState {
	const reduction = parseNumber(value);
	if (!reduction || reduction <= 0) return state;
	if (!state.combat) return state;

	// once_per_game_until_end_of_round → aplica damageReduction a todos os heróis
	const activeHeroIds = state.heroes.filter((h) => h.status === "active").map((h) => h.id);
	const newReduction: Record<string, number> = { ...state.combat.damageReduction };
	for (const id of activeHeroIds) {
		newReduction[id] = (newReduction[id] ?? 0) + reduction;
	}

	return log(
		{
			...state,
			combat: { ...state.combat, damageReduction: newReduction },
		},
		`Guarda: -${reduction} de dano sofrido por todos os heróis até fim da rodada.`,
	);
}

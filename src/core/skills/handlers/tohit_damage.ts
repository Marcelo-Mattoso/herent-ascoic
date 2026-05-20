// tohit_damage: Luz da Aurora Final (Paladino skill).
// No Despertar Vermelho (3) ou Roxo (4): +value no acerto e +value de dano.
// Registra bônus no bonusNextAttack do herói.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseSlashPair } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleTohitDamage(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const parsed = parseSlashPair(value);
	if (!parsed) return state;
	const { a: tohit, b: damage } = parsed;

	if (!ctx.sourceHeroId || !state.combat) return state;

	// Verificar nível do despertar (3=vermelho, 4=roxo)
	if (state.despertar < 3) return state;

	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero || hero.status !== "active") return state;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				bonusNextAttack: {
					...state.combat.bonusNextAttack,
					[hero.id]: (state.combat.bonusNextAttack?.[hero.id] ?? 0) + damage,
				},
			},
		},
		`Paladino: Despertar ${state.despertar} — +${tohit} acerto, +${damage} dano no próximo ataque.`,
	);
}

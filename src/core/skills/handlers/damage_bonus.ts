// damage_bonus: Fúria Rubra do Bárbaro Rubro.
// O herói paga `value` de vida para adicionar `value * 3` de dano ao próximo ataque.
// A engine resolve isso adicionando um bônus temporário no combat.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { applyDamageMin1 } from "../../systems/damageSystem";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleDamageBonus(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const cost = parseNumber(value);
	if (!cost || cost <= 0) return state;
	if (!ctx.sourceHeroId || !state.combat) return state;

	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero || hero.status !== "active") return state;

	const bonus = cost * 3;

	// Pagar custo em vida
	let next = applyDamageMin1(state, hero.id, cost);

	// Registrar bônus de dano no extraDice temporário (usamos bonusNextAttack no combat)
	next = {
		...next,
		combat: next.combat
			? {
					...next.combat,
					bonusNextAttack: {
						...(next.combat.bonusNextAttack ?? {}),
						[hero.id]: (next.combat.bonusNextAttack?.[hero.id] ?? 0) + bonus,
					},
				}
			: null,
	};

	return log(next, `Fúria Rubra: ${hero.cardName} paga ${cost} de vida, +${bonus} no próximo ataque.`);
}

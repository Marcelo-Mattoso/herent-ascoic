// heal_or_damage_bonus: Juramento da Última Luz (Paladino power).
// Uma vez por jogo: cura 5 de vida de todos os heróis OU +5 de dano no próximo ataque.
// value = "5/5".
// Escolha do jogador via ctx.value === "heal" ou "damage".

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseSlashPair } from "../valueParsers";
import { log, mapHero } from "../../reducer/utils";

export function handleHealOrDamageBonus(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const parsed = parseSlashPair(value);
	const healAmount = parsed?.a ?? 5;
	const damageAmount = parsed?.b ?? 5;

	const choice = typeof ctx.value === "string" ? ctx.value : "heal";

	if (choice === "damage" && ctx.sourceHeroId && state.combat) {
		return log(
			{
				...state,
				combat: {
					...state.combat,
					bonusNextAttack: {
						...state.combat.bonusNextAttack,
						[ctx.sourceHeroId]: (state.combat.bonusNextAttack?.[ctx.sourceHeroId] ?? 0) + damageAmount,
					},
				},
			},
			`Paladino: Juramento — +${damageAmount} de dano no próximo ataque.`,
		);
	}

	// Padrão: cura todos os heróis (exceto os com healBlocked)
	let next = state;
	for (const hero of state.heroes.filter((h) => h.status === "active")) {
		if (hero.healBlocked) {
			next = log(next, `${hero.cardName}: cura bloqueada (Fumaça da Fornalha).`);
			continue;
		}
		const healed = Math.min(hero.maxLife, hero.currentLife + healAmount);
		next = mapHero(next, hero.id, (h) => ({ ...h, currentLife: healed }));
	}
	return log(next, `Paladino: Juramento — todos os heróis curam ${healAmount} de vida.`);
}

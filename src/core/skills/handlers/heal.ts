// heal: Cura da Última Luz (Clérigo skill) e Poção de Vigor Menor.
// Cura `value` de vida em um herói alvo (determinado por ctx.targetHeroIds).

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log, mapHero } from "../../reducer/utils";

export function handleHeal(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const amount = parseNumber(value);
	if (!amount || amount <= 0) return state;

	// targetHeroIds vem de ctx; fallback para o próprio herói
	const targets = ctx.targetHeroIds?.length
		? ctx.targetHeroIds
		: ctx.sourceHeroId
			? [ctx.sourceHeroId]
			: [];

	if (targets.length === 0) return state;

	let next = state;
	for (const heroId of targets) {
		const hero = next.heroes.find((h) => h.id === heroId);
		if (!hero || hero.status !== "active") continue;
		const healed = Math.min(hero.maxLife, hero.currentLife + amount);
		next = mapHero(next, heroId, (h) => ({ ...h, currentLife: healed }));
		next = log(next, `${hero.cardName} recuperou ${healed - hero.currentLife} de vida.`);
	}
	return next;
}

// direct_damage: Brasa Viva (Tocha), Ataque Traiçoeiro (criaturas), etc.
// Causa `value` de dano direto a um alvo.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log, mapEnemy, mapHero } from "../../reducer/utils";

export function handleDirectDamage(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const amount = parseNumber(value);
	if (!amount || amount <= 0) return state;

	// Alvos de inimigos
	if (ctx.targetEnemyIds?.length) {
		let next = state;
		for (const enemyId of ctx.targetEnemyIds) {
			const enemy = next.activeEnemies.find((e) => e.id === enemyId);
			if (!enemy || enemy.status !== "active") continue;
			next = mapEnemy(next, enemyId, (e) => ({
				...e,
				currentLife: Math.max(0, e.currentLife - amount),
				status: e.currentLife - amount <= 0 ? "defeated" : e.status,
			}));
			next = log(next, `Dano direto: ${enemy.cardName} sofreu ${amount}.`);
		}
		return next;
	}

	// Alvo: herói com menos vida (lowest_life_hero)
	if (!ctx.targetHeroIds?.length) {
		const active = state.heroes.filter((h) => h.status === "active");
		if (active.length === 0) return state;
		const lowest = active.reduce((a, b) => (a.currentLife <= b.currentLife ? a : b));
		const next = mapHero(state, lowest.id, (h) => ({
			...h,
			currentLife: Math.max(0, h.currentLife - amount),
			status: h.currentLife - amount <= 0 ? "defeated" : h.status,
		}));
		return log(next, `Dano direto: ${lowest.cardName} sofreu ${amount}.`);
	}

	// Alvos de heróis explícitos
	let next = state;
	for (const heroId of ctx.targetHeroIds) {
		const hero = next.heroes.find((h) => h.id === heroId);
		if (!hero || hero.status !== "active") continue;
		next = mapHero(next, heroId, (h) => ({
			...h,
			currentLife: Math.max(0, h.currentLife - amount),
			status: h.currentLife - amount <= 0 ? "defeated" : h.status,
		}));
		next = log(next, `Dano direto: ${hero.cardName} sofreu ${amount}.`);
	}
	return next;
}

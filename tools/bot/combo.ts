import type { Action } from "@/core/actions/types";
import type { EnemyView, HeroView, PlayerView } from "@/core/projection/playerView";
import type { BotObservation } from "./observe";

export interface AttackForecast {
	readonly expectedDamage: number;
	readonly killChance: number;
	readonly hitChance: number;
}

export interface ComboPlan {
	readonly steps: readonly Action[];
	readonly score: number;
	readonly description: string;
	readonly forecast: AttackForecast;
}

const distributions = new Map<number, readonly number[]>();

function diceDistribution(count: number): readonly number[] {
	const safeCount = Math.max(0, Math.min(8, Math.floor(count)));
	const cached = distributions.get(safeCount);
	if (cached) return cached;
	let totals = [1];
	for (let die = 0; die < safeCount; die++) {
		const next = Array(totals.length + 6).fill(0) as number[];
		for (let total = 0; total < totals.length; total++) {
			for (let face = 1; face <= 6; face++) next[total + face] += (totals[total] ?? 0) / 6;
		}
		totals = next;
	}
	distributions.set(safeCount, totals);
	return totals;
}

/** Estimativa visível ao jogador: empate causa 1 dano dos dois lados. */
export function forecastAttack(
	hero: Pick<HeroView, "dice" | "hitBonus" | "damage">,
	enemy: Pick<EnemyView, "dice" | "hitBonus" | "currentLife">,
	hitBonus = 0,
	damageBonus = 0,
): AttackForecast {
	const heroRolls = diceDistribution(hero.dice);
	const enemyRolls = diceDistribution(enemy.dice);
	let expectedDamage = 0;
	let killChance = 0;
	let hitChance = 0;
	for (let h = 0; h < heroRolls.length; h++) {
		if (!heroRolls[h]) continue;
		for (let e = 0; e < enemyRolls.length; e++) {
			const probability = heroRolls[h]! * enemyRolls[e]!;
			if (!probability) continue;
			const margin = h + hero.hitBonus + hitBonus - e - enemy.hitBonus;
			const damage = margin > 0 ? Math.max(0, hero.damage + damageBonus) : margin === 0 ? 1 : 0;
			if (damage > 0) hitChance += probability;
			expectedDamage += probability * Math.min(damage, enemy.currentLife);
			if (damage >= enemy.currentLife) killChance += probability;
		}
	}
	return { expectedDamage, killChance, hitChance };
}

const available = (obs: BotObservation, heroId: string, abilityId: string) =>
	obs.abilities[heroId]?.find((ability) => ability.abilityId === abilityId && ability.status === "available");
const prepared = (obs: BotObservation, heroId: string, abilityId: string) =>
	obs.abilities[heroId]?.some((ability) => ability.abilityId === abilityId && ability.status === "prepared") ?? false;
const canAct = (view: PlayerView, heroId: string) => !view.combat?.heroesActed.includes(heroId);
const skill = (heroId: string, skillId: string, targetId?: string): Action => ({
	type: "USE_SKILL", payload: { sourceId: heroId, skillId, ...(targetId ? { targetIds: [targetId] } : {}) },
});

function attackValue(forecast: AttackForecast, enemy: EnemyView): number {
	return forecast.expectedDamage + forecast.killChance * (enemy.damage * 1.5 + 4);
}

function bestMageAttack(view: PlayerView, mage: HeroView): number {
	return Math.max(0, ...view.enemies.filter((enemy) => enemy.status === "active")
		.map((enemy) => attackValue(forecastAttack(mage, enemy), enemy)));
}

/** Compara sequências de preparo e ataque sem consultar informações ocultas. */
export function planCombos(obs: BotObservation): readonly ComboPlan[] {
	const { view } = obs;
	const attacks = obs.actions.filter((action): action is Extract<Action, { type: "CHOOSE_TARGET" }> =>
		action.type === "CHOOSE_TARGET");
	const mage = view.heroes.find((hero) => hero.cardId === "hero_crimson_rune_mage" && hero.status === "active");
	const cleric = view.heroes.find((hero) => hero.cardId === "hero_eternal_rest_cleric" && hero.status === "active");
	const activeEnemyCount = view.enemies.filter((enemy) => enemy.status === "active").length;
	const activeHeroCount = view.heroes.filter((hero) => hero.status === "active").length;
	const enemyStrike = Math.max(0, ...view.enemies.filter((entry) => entry.status === "active")
		.map((entry) => entry.damage));
	const plans: ComboPlan[] = [];
	for (const attack of attacks) {
		const hero = view.heroes.find((entry) => entry.id === attack.payload.heroId && entry.status === "active");
		const enemy = view.enemies.find((entry) => entry.id === attack.payload.enemyId && entry.status === "active");
		if (!hero || !enemy || !canAct(view, hero.id)) continue;
		const runeCandidate = mage && mage.id !== hero.id && canAct(view, mage.id)
			? available(obs, mage.id, "skill_rift_rune") : undefined;
		const rune = runeCandidate?.validTargetIds.includes(hero.id) ? runeCandidate : undefined;
		const fury = hero.cardId === "hero_crimson_barbarian" && hero.currentLife > 2
			? available(obs, hero.id, "skill_crimson_fury") : undefined;
		const furyPrepared = hero.currentLife > 2 && prepared(obs, hero.id, "skill_crimson_fury");
		const mark = hero.cardId === "hero_broken_veil_hunter"
			? available(obs, hero.id, "skill_prey_mark") : undefined;
		const echo = hero.cardId === "hero_deep_veil_necromancer" && hero.eco > 0
			? available(obs, hero.id, "spend_deep_veil_echo") : undefined;
		const supreme = mage && enemy.id === "boss"
			? available(obs, mage.id, "power_supreme_rift_rune") : undefined;
		for (const useRune of rune ? [false, true] : [false]) {
			for (const useFury of fury ? [false, true] : [false]) {
				const steps: Action[] = [];
				const names: string[] = [];
				let bonusHit = useRune ? 3 : 0;
				let bonusDamage = useFury || furyPrepared ? 6 : 0;
				let cost = 0;
				if (useRune && mage) {
					steps.push(skill(mage.id, "skill_rift_rune", hero.id));
					names.push("Runa +3 acerto");
					cost += bestMageAttack(view, mage) +
						Math.max(0, activeEnemyCount - activeHeroCount + 1) * enemyStrike * 0.8;
				}
				if (mark?.validTargetIds.includes(enemy.id)) {
					steps.push(skill(hero.id, "skill_prey_mark", enemy.id));
					names.push("Marca da Presa");
					bonusHit += 1;
				}
				if (echo) {
					const hit = forecastAttack(hero, enemy, bonusHit + 2, bonusDamage);
					const damage = forecastAttack(hero, enemy, bonusHit, bonusDamage + 2);
					if (Math.max(attackValue(hit, enemy), attackValue(damage, enemy)) >
						attackValue(forecastAttack(hero, enemy, bonusHit, bonusDamage), enemy) + 0.5) {
						steps.push(skill(hero.id, "spend_deep_veil_echo"));
						names.push("Eco +2");
						if (attackValue(hit, enemy) >= attackValue(damage, enemy)) bonusHit += 2;
						else bonusDamage += 2;
						cost += 0.6;
					}
				}
				const supremeGain = attackValue(forecastAttack(hero, enemy, bonusHit + 2, bonusDamage), enemy) -
					attackValue(forecastAttack(hero, enemy, bonusHit, bonusDamage), enemy);
				if (supreme && mage && supremeGain > 1.5) {
					steps.push(skill(mage.id, "power_supreme_rift_rune"));
					names.push("Runa Suprema");
					bonusHit += 2;
					cost += 1.5;
				}
				if (useFury) {
					steps.push(skill(hero.id, "skill_crimson_fury"));
					names.push("Fúria +6 dano");
					const healingReady = cleric && canAct(view, cleric.id) && available(obs, cleric.id, "skill_last_light_healing");
					cost += healingReady ? 0.7 : hero.currentLife <= enemy.damage + 2 ? 5 : 2;
				}
				const forecast = forecastAttack(hero, enemy, bonusHit, bonusDamage);
				steps.push(attack);
				const value = attackValue(forecast, enemy) - cost;
				const score = 180 + value * 10 + (useRune && (useFury || furyPrepared) ? 8 : 0);
				plans.push({ steps, score, forecast, description:
					`${names.length ? `${names.join(" → ")} → ` : ""}${hero.cardId} ataca ${enemy.cardId} ` +
					`(dano médio ${forecast.expectedDamage.toFixed(1)}, abate ${(forecast.killChance * 100).toFixed(0)}%)` });
			}
		}
	}
	return plans.sort((a, b) => b.score - a.score || a.steps.length - b.steps.length);
}

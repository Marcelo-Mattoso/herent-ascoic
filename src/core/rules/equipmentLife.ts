// Maximum-life equipment bonuses are derived from the equipped sources.
// Never increment the stored maximum on equip without subtracting the previous
// contribution: repeated equip/unequip must not create permanent health.
import type { GameEngine } from "../gameEngine";
import { abilityById, cardById, skillsOf } from "../gameEngine";
import type { ExprNode, EffectNode } from "../skills/dsl/types";
import type { GameState } from "../state/gameState";
import type { HeroRecord } from "../state/heroState";
import { awakeningOf, statOf, withUnitStats } from "../state/access";
import { gameOf } from "../../engine/state";

function numberOf(value: ExprNode, params: Readonly<Record<string, unknown>>, index: number): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const resolved = value.startsWith("$") ? params[value.slice(1)] : value;
		const number = typeof resolved === "number" ? resolved : Number(resolved);
		return Number.isFinite(number) ? number : 0;
	}
	if (Array.isArray(value)) return value[index] ?? 0;
	const expr = value as { op: string; args: readonly [ExprNode, ExprNode] };
	const left = numberOf(expr.args[0], params, index);
	const right = numberOf(expr.args[1], params, index);
	switch (expr.op) {
		case "add": return left + right;
		case "sub": return left - right;
		case "mul": return left * right;
		case "div": return right === 0 ? 0 : left / right;
		case "min": return Math.min(left, right);
		case "max": return Math.max(left, right);
		default: return 0;
	}
}

function maximumLifeEffects(
	effects: readonly EffectNode[] | undefined,
	params: Readonly<Record<string, unknown>>,
	index: number,
): number {
	return (effects ?? []).reduce((total, effect) =>
		effect.kind === "p_modifier" && effect.stat === "s_max_life" && effect.operation === "add"
			? total + numberOf(effect.value, params, index)
			: total, 0);
}

/** Supports reusable passive SkillRefs and continuous AbilityGrants alike. */
export function equippedMaximumLifeBonus(
	engine: GameEngine,
	hero: Pick<HeroRecord, "activeItems">,
	awakening: number,
): number {
	let total = 0;
	for (const id of new Set(Object.values(hero.activeItems))) {
		if (!id) continue;
		const card = cardById(engine, id);
		if (card?.type !== "item" && card?.type !== "ally") continue;
		const granted = new Set((card.grants ?? []).map((grant) => grant.abilityId));
		for (const grant of card.grants ?? []) {
			if (grant.activation.kind !== "continuous") continue;
			const ability = abilityById(engine, grant.abilityId);
			total += maximumLifeEffects(ability?.effect,
				{ ...(ability?.defaultParams ?? {}), ...(grant.params ?? {}) }, awakening);
		}
		for (const { def, ref } of skillsOf(engine, id)) {
			if (granted.has(def.id) || def.operate_type !== "op_passive") continue;
			total += maximumLifeEffects(def.effect,
				{ ...(def.params ?? {}), ...(ref.params ?? {}) }, awakening);
		}
	}
	return total;
}

/** Apply only the difference in active bonuses and clamp current life, never heal. */
export function reconcileEquipmentMaximumLife(
	engine: GameEngine,
	before: GameState,
	after: GameState,
): GameState {
	let next = after;
	const index = awakeningOf(after);
	for (const hero of gameOf(after).heroes) {
		const previous = gameOf(before).heroes.find((entry) => entry.id === hero.id);
		if (!previous) continue;
		const delta = equippedMaximumLifeBonus(engine, hero, index) -
			equippedMaximumLifeBonus(engine, previous, awakeningOf(before));
		if (!delta) continue;
		const oldMaximum = statOf(next, hero.id, "maxLife");
		const oldCurrent = statOf(next, hero.id, "currentLife");
		if (oldMaximum === undefined || oldCurrent === undefined) continue;
		const maxLife = Math.max(1, oldMaximum + delta);
		next = withUnitStats(next, hero.id, {
			maxLife,
			currentLife: Math.min(oldCurrent, maxLife),
		});
	}
	return next;
}

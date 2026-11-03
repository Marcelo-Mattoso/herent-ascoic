// Modificadores de chefe que precisam agir ANTES do dano e da rolagem.
// O restante das habilidades executa pelo motor declarativo normal.
import { type GameEngine, skillsOf } from "../gameEngine";
import { scopedFlagOf, withScopedFlag } from "../state/access";
import type { SkillDefinition } from "../data/skillTypes";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";

function modifierValue(value: unknown, params?: Readonly<Record<string, number | string>>): number {
	const resolved = value === "$value" ? params?.value : value;
	const numeric = typeof resolved === "number" ? resolved : typeof resolved === "string" ? Number(resolved) : NaN;
	return Number.isFinite(numeric) ? numeric : 0;
}

export function isInlineBossSkill(def: SkillDefinition | null): boolean {
	return Boolean(def?.category === "boss_skill" && def.operate_type === "op_triggered" &&
		def.trigger?.event === "evt_damage_taken" &&
		(def.conditions ?? []).every((condition) =>
			"kind" in condition && condition.kind === "has_condition" &&
			condition.of === "$self" && condition.conditionType === "half_life_or_less") &&
		(!def.cooldown || (def.cooldown.scope === "round" && def.cooldown.charges === 1)) &&
		def.effect?.length && def.effect.every((e) =>
			e.kind === "p_modifier" && (e.stat === "s_hit_bonus" || e.stat === "s_damage_reduction"),
		));
}

function conditionsMet(def: SkillDefinition, boss: EnemyState): boolean {
	return (def.conditions ?? []).every((condition) => {
		if ("kind" in condition && condition.kind === "has_condition" && condition.of === "$self" &&
			condition.conditionType === "half_life_or_less")
			return boss.currentLife <= Math.floor(boss.maxLife / 2);
		return false;
	});
}

function appliedKey(skillId: string): string { return "boss:inline:" + skillId; }

export function inlineBossHitBonus(engine: GameEngine, boss: EnemyState): number {
	let bonus = 0;
	for (const { def, ref } of skillsOf(engine, boss.cardId)) {
		if (!isInlineBossSkill(def) || !conditionsMet(def, boss)) continue;
		for (const effect of def.effect ?? [])
			if (effect.kind === "p_modifier" && effect.stat === "s_hit_bonus")
				bonus += modifierValue(effect.value, ref.params);
	}
	return bonus;
}

export function inlineBossDamageReduction(
	engine: GameEngine, state: GameState, boss: EnemyState,
): { readonly amount: number; readonly usedIds: readonly string[] } {
	let amount = 0;
	const usedIds: string[] = [];
	for (const { def, ref } of skillsOf(engine, boss.cardId)) {
		if (!isInlineBossSkill(def) || !conditionsMet(def, boss)) continue;
		if (scopedFlagOf(state, "round", appliedKey(def.id), "boss")) continue;
		let reduction = 0;
		for (const effect of def.effect ?? [])
			if (effect.kind === "p_modifier" && effect.stat === "s_damage_reduction")
				reduction += modifierValue(effect.value, ref.params);
		if (reduction > 0) { amount += reduction; usedIds.push(def.id); }
	}
	return { amount, usedIds };
}

export function markInlineBossSkillsUsed(state: GameState, skillIds: readonly string[]): GameState {
	return skillIds.reduce(
		(next, id) => withScopedFlag(next, "round", appliedKey(id), "boss"),
		state,
	);
}

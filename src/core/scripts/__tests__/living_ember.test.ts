// Testes de skill_living_ember_oil após migração para DSL (patch-21 Lote G).
// Usa evaluate() diretamente, pois o script foi removido.

import { describe, expect, it } from "vitest";
import { drainStack } from "../../effects/resolver";
import { buildScriptCtx } from "../../scripts/context";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState } from "../../state/gameState";
import { SKILLS } from "../../data/skills";
import { evaluate } from "../../skills/dsl/evaluate";

const goblin: EnemyState = {
	id: "e_goblin",
	cardId: "creature_dark_cave_goblin",
	maxLife: 4,
	currentLife: 4,
	damage: 1,
	hitBonus: 0,
	dice: 1,
	tokens: {},
	conditions: [],
	firstDamageTakenThisTurn: false,
	status: "active",
};

const slime: EnemyState = {
	id: "e_slime",
	cardId: "creature_wet_stone_slime",
	maxLife: 6,
	currentLife: 6,
	damage: 1,
	hitBonus: 0,
	dice: 1,
	tokens: {},
	conditions: [],
	firstDamageTakenThisTurn: false,
	status: "active",
};

const def = SKILLS.abilities.find((a) => a.id === "skill_living_ember_oil")!;

describe("skill_living_ember_oil — Frasco de Óleo Incendiário", () => {
	it("enfileira i_damage 2 contra criatura comum", () => {
		const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = { ...base, activeEnemies: [goblin] };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "skill_living_ember_oil", targetEnemyIds: ["e_goblin"] },
			{},
		);
		const next = evaluate(def.effect!, ctx);
		expect(next.effectStack.pending).toHaveLength(1);
		expect(next.effectStack.pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_goblin",
			amount: 2,
		});
	});

	it("enfileira i_damage 3 contra criatura com Corpo Gelatinoso", () => {
		const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = { ...base, activeEnemies: [slime] };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "skill_living_ember_oil", targetEnemyIds: ["e_slime"] },
			{},
		);
		const next = evaluate(def.effect!, ctx);
		expect(next.effectStack.pending).toHaveLength(1);
		expect(next.effectStack.pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_slime",
			amount: 3,
		});
	});

	it("causa dano correto após drainStack — criatura comum", () => {
		const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = { ...base, activeEnemies: [goblin] };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "skill_living_ember_oil", targetEnemyIds: ["e_goblin"] },
			{},
		);
		const result = drainStack(evaluate(def.effect!, ctx));
		expect(result.activeEnemies.find((e) => e.id === "e_goblin")?.currentLife).toBe(2);
	});

	it("sem alvo — sem efeito (i_if sem alvo resolvido → skips)", () => {
		const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const ctx = buildScriptCtx(
			base,
			{ triggeredBy: "on_use", skillId: "skill_living_ember_oil" },
			{},
		);
		// Sem targetEnemyIds, $target não resolve → i_if/i_damage noops
		const result = drainStack(evaluate(def.effect!, ctx));
		// Nenhum inimigo na lista, estado praticamente inalterado
		expect(result.activeEnemies).toHaveLength(0);
	});
});

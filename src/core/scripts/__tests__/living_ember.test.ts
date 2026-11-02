import { describe, expect, it } from "vitest";
import { SKILLS } from "../../data/skills";
import { drainStack } from "../../effects/resolver";
import { buildScriptCtx } from "../../scripts/context";
import { evaluate } from "../../skills/dsl/evaluate";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState } from "../../state/gameState";
import { testEngine } from "@/core/__tests__/testEngine";
import { enemiesOf, effectStackOf } from "../../state/access";
import { settled } from "../../__tests__/fixtures";
import { withGame } from "../../../engine/state";

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
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const state = settled(withGame(base, (prevGame) => ({ ...prevGame, activeEnemies: [goblin] })));
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "on_use",
				skillId: "skill_living_ember_oil",
				targetEnemyIds: ["e_goblin"],
			},
			{},
		);
		const next = evaluate(def.effect!, ctx);
		expect(effectStackOf(next).pending).toHaveLength(1);
		expect(effectStackOf(next).pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_goblin",
			amount: 2,
		});
	});

	it("enfileira i_damage 3 contra criatura com Corpo Gelatinoso", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const state = settled(withGame(base, (prevGame) => ({ ...prevGame, activeEnemies: [slime] })));
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "on_use",
				skillId: "skill_living_ember_oil",
				targetEnemyIds: ["e_slime"],
			},
			{},
		);
		const next = evaluate(def.effect!, ctx);
		expect(effectStackOf(next).pending).toHaveLength(1);
		expect(effectStackOf(next).pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_slime",
			amount: 3,
		});
	});

	it("causa dano correto após drainStack — criatura comum", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const state = settled(withGame(base, (prevGame) => ({ ...prevGame, activeEnemies: [goblin] })));
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "on_use",
				skillId: "skill_living_ember_oil",
				targetEnemyIds: ["e_goblin"],
			},
			{},
		);
		const result = drainStack(testEngine, evaluate(def.effect!, ctx));
		expect(
			enemiesOf(result).find((e) => e.id === "e_goblin")?.currentLife,
		).toBe(2);
	});

	it("sem alvo — sem efeito (i_if sem alvo resolvido → skips)", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const ctx = buildScriptCtx(testEngine, 
			base,
			{ triggeredBy: "on_use", skillId: "skill_living_ember_oil" },
			{},
		);
		// Sem targetEnemyIds, $target não resolve → i_if/i_damage noops
		const result = drainStack(testEngine, evaluate(def.effect!, ctx));
		// Nenhum inimigo na lista, estado praticamente inalterado
		expect(enemiesOf(result)).toHaveLength(0);
	});
});

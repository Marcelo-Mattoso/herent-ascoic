import { describe, expect, it } from "vitest";
import type { EvalCtx } from "../types";
import { SkipEffect, resolveEntityListRef, resolveEntityRef, resolveExpr } from "../resolveExpr";
import { resolveCondition } from "../resolveCondition";
import { createInitialGameState } from "../../../state/gameState";
import type { GameState } from "../../../state/gameState";

function ctx(): EvalCtx {
	const base = createInitialGameState({ heroCardIds: [] });
	const state: GameState = {
		...base,
		heroes: [{ id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 4, damage: 3, hitBonus: 0, dice: 2, impeto: 0 as const, activeItems: {}, backpack: [], usedPowers: {}, conditions: ["poison"], status: "active" as const, playerIndex: 0, xp: 0 }],
		activeEnemies: [{ id: "e1", cardId: "creature_dark_cave_goblin", maxLife: 8, currentLife: 6, damage: 2, hitBonus: 0, dice: 1, tokens: {}, conditions: ["burn"], firstDamageTakenThisTurn: false, status: "active" as const }],
		despertar: 2 as const,
	};
	const build = (next = state): EvalCtx => ({ state: next, skillId: "test", params: { value: "7", ids: ["a", "b"], ally: "h1" }, sourceId: "h1", targetId: "e1", targetIds: ["e1"],
		query: { creatureHasSkill: (id, skill) => id === "e1" && skill === "fang", dungeonLevel: () => 3, roomEnemyCount: () => 1, heroWithLowestLife: () => "h1" },
		action: { pushEffect: () => next, addComponent: () => next, requestChoice: () => next, log: () => next }, withState: build });
	return build();
}

describe("DSL expressions", () => {
	it("resolve literais, parâmetros, estado, entidades e operações aritméticas", () => {
		const c = ctx();
		expect(resolveExpr(2, c)).toBe(2);
		expect(resolveExpr("8", c)).toBe(8);
		expect(resolveExpr("$value", c)).toBe(7);
		expect(resolveExpr("$dungeon.level", c)).toBe(3);
		expect(resolveExpr("$room.enemy_count", c)).toBe(1);
		expect(resolveExpr("$self.currentLife", c)).toBe(4);
		expect(resolveExpr("$target.maxLife", c)).toBe(8);
		expect(resolveExpr({ op: "add", args: [2, { op: "mul", args: [3, 4] }] }, c)).toBe(14);
		expect(resolveExpr({ op: "div", args: [3, 0] }, c)).toBe(0);
		expect(resolveExpr({ op: "min", args: [3, 1] }, c)).toBe(1);
		expect(resolveExpr({ op: "max", args: [3, 1] }, c)).toBe(3);
		expect(resolveExpr([1, 2, 9, 4, 5], c)).toBe(9);
	});

	it("rejeita referências inválidas e resolve listas de entidade", () => {
		const c = ctx();
		expect(() => resolveExpr("word", c)).toThrow("não começa");
		expect(() => resolveExpr("$unknown", c)).toThrow("desconhecida");
		expect(() => resolveExpr([1, 2, null, 4, 5], c)).toThrow(SkipEffect);
		expect(resolveEntityRef("$source", c)).toBe("h1");
		expect(resolveEntityRef("$target", c)).toBe("e1");
		expect(resolveEntityRef("$lowest_life_hero", c)).toBe("h1");
		expect(resolveEntityRef("$ally", c)).toBe("h1");
		expect(resolveEntityListRef("$each", c)).toEqual(["e1"]);
		expect(resolveEntityListRef("all_heroes", c)).toEqual(["h1"]);
		expect(resolveEntityListRef("all_enemies", c)).toEqual(["e1"]);
	});
});

describe("DSL conditions", () => {
	it("avalia skill, condição, comparadores e composições", () => {
		const c = ctx();
		expect(resolveCondition({ kind: "has_skill", of: "$target", skillId: "fang" }, c)).toBe(true);
		expect(resolveCondition({ kind: "has_condition", of: "$source", conditionType: "poison" }, c)).toBe(true);
		expect(resolveCondition({ kind: "has_condition", of: "$target", conditionType: "poison" }, c)).toBe(false);
		expect(resolveCondition({ kind: "compare", op: "gt", left: "$self.currentLife", right: 3 }, c)).toBe(true);
		expect(resolveCondition({ kind: "compare", op: "lte", left: 3, right: 3 }, c)).toBe(true);
		expect(resolveCondition({ kind: "compare", op: "in", left: "a", right: "$ids" }, c)).toBe(true);
		expect(resolveCondition({ kind: "and", children: [{ kind: "compare", op: "eq", left: 1, right: 1 }, { kind: "compare", op: "lt", left: 1, right: 2 }] }, c)).toBe(true);
		expect(resolveCondition({ kind: "not", child: { kind: "compare", op: "gte", left: 1, right: 2 } }, c)).toBe(true);
		expect(resolveCondition({ any_of: [{ kind: "compare", op: "eq", left: 1, right: 2 }, { kind: "compare", op: "eq", left: 2, right: 2 }] }, c)).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import {
	applyConditionToEnemy,
	applyConditionToHero,
	removeConditionFromEnemy,
	removeConditionFromHero,
} from "../conditionSystem";
import { createInitialGameState } from "../../state/gameState";
import { createEmptyCombatState } from "../../state/combatState";
import { getComponents } from "../../ecs/world";
import type { ConditionComponent } from "../../ecs/types";
import type { GameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import type { EnemyState } from "../../state/enemyState";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardName: "Bárbaro Rubro",
		maxLife: 10,
		currentLife: 10,
		damage: 4,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardName: "Goblin",
		maxLife: 5,
		currentLife: 5,
		damage: 2,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function makeState(
	heroOverrides: Partial<HeroState> = {},
	enemyOverrides?: Partial<EnemyState>,
): GameState {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	return {
		...base,
		heroes: [makeHero(heroOverrides)],
		activeEnemies: enemyOverrides !== undefined ? [makeEnemy(enemyOverrides)] : [],
		combat: createEmptyCombatState(),
	};
}

// ── condições em heróis ───────────────────────────────────────────────────────

describe("applyConditionToHero", () => {
	it("adiciona condição ao herói", () => {
		const state = makeState();
		const result = applyConditionToHero(state, "h1", "poisoned");
		expect(result.heroes[0]!.conditions).toContain("poisoned");
	});

	it("não adiciona condição duplicada", () => {
		const state = makeState({ conditions: ["poisoned"] });
		const result = applyConditionToHero(state, "h1", "poisoned");
		expect(result.heroes[0]!.conditions.filter((c) => c === "poisoned")).toHaveLength(1);
	});

	it("retorna estado inalterado para herói com condição já aplicada", () => {
		const state = makeState({ conditions: ["poisoned"] });
		const result = applyConditionToHero(state, "h1", "poisoned");
		expect(result).toBe(state);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState();
		const result = applyConditionToHero(state, "unknown_id", "poisoned");
		expect(result).toBe(state);
	});

	it("sincroniza ConditionComponent no ECS world", () => {
		const state = makeState();
		const result = applyConditionToHero(state, "h1", "poisoned");
		const conditions = getComponents<ConditionComponent>(result.world, "h1", "condition");
		expect(conditions.some((c) => c.conditionType === "poisoned")).toBe(true);
	});
});

describe("removeConditionFromHero", () => {
	it("remove condição existente", () => {
		const state = makeState({ conditions: ["poisoned", "stunned"] });
		const result = removeConditionFromHero(state, "h1", "poisoned");
		expect(result.heroes[0]!.conditions).not.toContain("poisoned");
		expect(result.heroes[0]!.conditions).toContain("stunned");
	});

	it("não falha se condição não existe", () => {
		const state = makeState({ conditions: [] });
		const result = removeConditionFromHero(state, "h1", "poisoned");
		expect(result.heroes[0]!.conditions).toEqual([]);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState({ conditions: ["poisoned"] });
		const result = removeConditionFromHero(state, "unknown_id", "poisoned");
		expect(result).toBe(state);
	});

	it("sincroniza ECS world após remoção", () => {
		const state = makeState({ conditions: ["poisoned"] });
		const result = removeConditionFromHero(state, "h1", "poisoned");
		const conditions = getComponents<ConditionComponent>(result.world, "h1", "condition");
		expect(conditions.some((c) => c.conditionType === "poisoned")).toBe(false);
	});
});

// ── condições em inimigos ─────────────────────────────────────────────────────

describe("applyConditionToEnemy", () => {
	it("adiciona condição ao inimigo", () => {
		const state = makeState({}, {});
		const result = applyConditionToEnemy(state, "e1", "marked");
		expect(result.activeEnemies[0]!.conditions).toContain("marked");
	});

	it("não adiciona condição duplicada", () => {
		const state = makeState({}, { conditions: ["marked"] });
		const result = applyConditionToEnemy(state, "e1", "marked");
		expect(result.activeEnemies[0]!.conditions.filter((c) => c === "marked")).toHaveLength(1);
	});

	it("retorna estado inalterado para inimigo com condição já aplicada", () => {
		const state = makeState({}, { conditions: ["marked"] });
		const result = applyConditionToEnemy(state, "e1", "marked");
		expect(result).toBe(state);
	});

	it("sincroniza ConditionComponent no ECS world para inimigo", () => {
		const state = makeState({}, {});
		const result = applyConditionToEnemy(state, "e1", "marked");
		const conditions = getComponents<ConditionComponent>(result.world, "e1", "condition");
		expect(conditions.some((c) => c.conditionType === "marked")).toBe(true);
	});
});

describe("removeConditionFromEnemy", () => {
	it("remove condição existente do inimigo", () => {
		const state = makeState({}, { conditions: ["marked", "slowed"] });
		const result = removeConditionFromEnemy(state, "e1", "marked");
		expect(result.activeEnemies[0]!.conditions).not.toContain("marked");
		expect(result.activeEnemies[0]!.conditions).toContain("slowed");
	});

	it("não falha se condição não existe no inimigo", () => {
		const state = makeState({}, { conditions: [] });
		const result = removeConditionFromEnemy(state, "e1", "marked");
		expect(result.activeEnemies[0]!.conditions).toEqual([]);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState({}, { conditions: ["marked"] });
		const result = removeConditionFromEnemy(state, "unknown_id", "marked");
		expect(result).toBe(state);
	});
});

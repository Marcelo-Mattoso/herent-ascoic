import { describe, expect, it } from "vitest";
import type { HealthComponent } from "../../ecs/types";
import { getComponent } from "../../ecs/world";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { applyDamage, applyDamageMin1 } from "../damageSystem";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
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
		cardId: "creature_dark_cave_goblin",
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
		activeEnemies:
			enemyOverrides !== undefined ? [makeEnemy(enemyOverrides)] : [],
		combat: createEmptyCombatState(),
	};
}

// ── applyDamage ───────────────────────────────────────────────────────────────

describe("applyDamage — herói", () => {
	it("reduz vida do herói pelo valor do dano", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("não reduz abaixo de 0", () => {
		const state = makeState({ currentLife: 3 });
		const result = applyDamage(state, "h1", 10);
		expect(result.heroes[0]!.currentLife).toBe(0);
	});

	it("define status 'defeated' quando vida chega a 0", () => {
		const state = makeState({ currentLife: 3 });
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes[0]!.status).toBe("defeated");
	});

	it("não altera status se vida > 0 após dano", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyDamage(state, "h1", 2);
		expect(result.heroes[0]!.status).toBe("active");
	});

	it("não altera outros heróis", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const h2: HeroState = makeHero({ id: "h2", currentLife: 7 });
		const state: GameState = {
			...base,
			heroes: [makeHero({ currentLife: 5 }), h2],
			combat: createEmptyCombatState(),
		};
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes.find((h) => h.id === "h2")!.currentLife).toBe(7);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyDamage(state, "unknown_id", 3);
		expect(result).toBe(state);
	});

	it("sincroniza HealthComponent no ECS world após dano ao herói", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamage(state, "h1", 3);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health).toBeDefined();
		expect(health?.current).toBe(5);
	});
});

describe("applyDamage — inimigo", () => {
	it("reduz vida do inimigo pelo valor do dano", () => {
		const state = makeState({}, { currentLife: 5 });
		const result = applyDamage(state, "e1", 2);
		expect(result.activeEnemies[0]!.currentLife).toBe(3);
	});

	it("define status 'defeated' quando vida do inimigo chega a 0", () => {
		const state = makeState({}, { currentLife: 3 });
		const result = applyDamage(state, "e1", 5);
		expect(result.activeEnemies[0]!.status).toBe("defeated");
	});

	it("sincroniza HealthComponent no ECS world após dano ao inimigo", () => {
		const state = makeState({}, { currentLife: 5 });
		const result = applyDamage(state, "e1", 2);
		const health = getComponent<HealthComponent>(result.world, "e1", "health");
		expect(health).toBeDefined();
		expect(health?.current).toBe(3);
	});
});

// ── applyDamageMin1 ───────────────────────────────────────────────────────────

describe("applyDamageMin1 — herói", () => {
	it("clampeia em 1 se dano excede vida atual", () => {
		const state = makeState({ currentLife: 2 });
		const result = applyDamageMin1(state, "h1", 10);
		expect(result.heroes[0]!.currentLife).toBe(1);
	});

	it("nunca define status 'defeated' (vida mínima é 1)", () => {
		const state = makeState({ currentLife: 1 });
		const result = applyDamageMin1(state, "h1", 5);
		expect(result.heroes[0]!.status).toBe("active");
		expect(result.heroes[0]!.currentLife).toBe(1);
	});

	it("aplica dano normalmente quando não atinge o mínimo", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamageMin1(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("sincroniza ECS world com vida clampada", () => {
		const state = makeState({ currentLife: 2 });
		const result = applyDamageMin1(state, "h1", 10);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health?.current).toBe(1);
	});
});

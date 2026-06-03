import { describe, expect, it } from "vitest";
import type { HealthComponent } from "../../ecs/types";
import { getComponent } from "../../ecs/world";
import { createEmptyCombatState } from "../../state/combatState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import {
	applyFullHeal,
	applyHeal,
	applyLifeGain,
	applySurvive,
} from "../healSystem";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 6,
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

function makeState(heroOverrides: Partial<HeroState> = {}): GameState {
	const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
	return {
		...base,
		heroes: [makeHero(heroOverrides)],
		combat: createEmptyCombatState(),
	};
}

// ── applyHeal ─────────────────────────────────────────────────────────────────

describe("applyHeal", () => {
	it("aumenta vida do herói pelo valor curado", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyHeal(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(8);
	});

	it("não ultrapassa maxLife", () => {
		const state = makeState({ currentLife: 9, maxLife: 10 });
		const result = applyHeal(state, "h1", 5);
		expect(result.heroes[0]!.currentLife).toBe(10);
	});

	it("retorna estado inalterado se healBlocked", () => {
		const state = makeState({ currentLife: 5, healBlocked: true });
		const result = applyHeal(state, "h1", 3);
		expect(result).toBe(state);
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState();
		const result = applyHeal(state, "unknown_id", 3);
		expect(result).toBe(state);
	});

	it("sincroniza HealthComponent no ECS world", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyHeal(state, "h1", 3);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health?.current).toBe(8);
	});
});

// ── applyFullHeal ─────────────────────────────────────────────────────────────

describe("applyFullHeal", () => {
	it("restaura vida ao máximo", () => {
		const state = makeState({ currentLife: 3, maxLife: 10 });
		const result = applyFullHeal(state, "h1");
		expect(result.heroes[0]!.currentLife).toBe(10);
	});

	it("limpa healBlocked mesmo se estava ativo", () => {
		const state = makeState({ currentLife: 3, healBlocked: true });
		const result = applyFullHeal(state, "h1");
		expect(result.heroes[0]!.healBlocked).toBeUndefined();
	});

	it("funciona mesmo com healBlocked (ignora a restrição)", () => {
		const state = makeState({ currentLife: 3, maxLife: 10, healBlocked: true });
		const result = applyFullHeal(state, "h1");
		expect(result.heroes[0]!.currentLife).toBe(10);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState();
		const result = applyFullHeal(state, "unknown_id");
		expect(result).toBe(state);
	});

	it("sincroniza HealthComponent no ECS world com maxLife", () => {
		const state = makeState({ currentLife: 3, maxLife: 10 });
		const result = applyFullHeal(state, "h1");
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health?.current).toBe(10);
		expect(health?.max).toBe(10);
	});
});

// ── applySurvive ──────────────────────────────────────────────────────────────

describe("applySurvive", () => {
	it("herói com vida > 1 mantém vida atual", () => {
		const state = makeState({ currentLife: 5 });
		const result = applySurvive(state, "h1");
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("herói com vida 0 é trazido para 1", () => {
		const state = makeState({ currentLife: 0, status: "defeated" });
		const result = applySurvive(state, "h1");
		expect(result.heroes[0]!.currentLife).toBe(1);
	});

	it("define status como 'active'", () => {
		const state = makeState({ currentLife: 0, status: "defeated" });
		const result = applySurvive(state, "h1");
		expect(result.heroes[0]!.status).toBe("active");
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState();
		const result = applySurvive(state, "unknown_id");
		expect(result).toBe(state);
	});
});

// ── applyLifeGain ─────────────────────────────────────────────────────────────

describe("applyLifeGain", () => {
	it("aumenta vida mesmo com healBlocked ativo", () => {
		const state = makeState({ currentLife: 5, healBlocked: true });
		const result = applyLifeGain(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(8);
	});

	it("não ultrapassa maxLife", () => {
		const state = makeState({ currentLife: 9, maxLife: 10 });
		const result = applyLifeGain(state, "h1", 5);
		expect(result.heroes[0]!.currentLife).toBe(10);
	});

	it("aplica ganho de vida normal sem healBlocked", () => {
		const state = makeState({ currentLife: 4 });
		const result = applyLifeGain(state, "h1", 2);
		expect(result.heroes[0]!.currentLife).toBe(6);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState();
		const result = applyLifeGain(state, "unknown_id", 3);
		expect(result).toBe(state);
	});

	it("sincroniza HealthComponent no ECS world", () => {
		const state = makeState({ currentLife: 5, healBlocked: true });
		const result = applyLifeGain(state, "h1", 3);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health?.current).toBe(8);
	});
});

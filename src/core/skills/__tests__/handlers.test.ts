import { describe, expect, it } from "vitest";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { handleDamageBonus } from "../handlers/damage_bonus";
import { handleToken } from "../handlers/token";

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
		firstDamageTakenThisTurn: true,
		status: "active",
		...overrides,
	};
}

function makeState(
	heroOverrides: Partial<HeroState> = {},
	extras: Partial<GameState> = {},
): GameState {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	return {
		...base,
		heroes: [makeHero(heroOverrides)],
		combat: createEmptyCombatState(),
		...extras,
	};
}

// ── damage_bonus ──────────────────────────────────────────────────────────────

describe("handleDamageBonus", () => {
	it("paga vida ao usar (verificação de custo)", () => {
		const state = makeState({ currentLife: 8 });
		const result = handleDamageBonus(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			2,
		);
		const hero = result.heroes.find((h) => h.id === "h1")!;
		// max(1, 8 - 2) = 6
		expect(hero.currentLife).toBe(6);
	});

	it("com vida suficiente, paga corretamente e registra +6 no bonusNextAttack", () => {
		const state = makeState({ currentLife: 8 });
		const result = handleDamageBonus(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			2,
		);
		const hero = result.heroes.find((h) => h.id === "h1")!;
		expect(hero.currentLife).toBe(6);
		expect(result.combat?.bonusNextAttack?.["h1"]).toEqual([
			{ label: "Fúria Rubra", value: 6 },
		]); // 2 * 3
	});

	it("retorna estado inalterado sem sourceHeroId", () => {
		const state = makeState();
		const result = handleDamageBonus(
			state,
			{ triggeredBy: "before_attack" },
			2,
		);
		expect(result).toBe(state);
	});

	it("retorna estado inalterado com value nulo", () => {
		const state = makeState();
		const result = handleDamageBonus(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			null,
		);
		expect(result).toBe(state);
	});
});

// ── token ─────────────────────────────────────────────────────────────────────

describe("handleToken (Eco do Necromante)", () => {
	it("adiciona 1 eco ao heroId", () => {
		const state = makeState();
		const result = handleToken(
			state,
			{ triggeredBy: "on_destroy_creature_with_attack", sourceHeroId: "h1" },
			"1/3/2/2",
		);
		expect(result.combat?.ecoTokens?.["h1"]).toBe(1);
	});

	it("acumula eco existente", () => {
		const state = makeState(
			{},
			{
				combat: { ...createEmptyCombatState(), ecoTokens: { h1: 1 } },
			},
		);
		const result = handleToken(
			state,
			{ triggeredBy: "on_destroy_creature_with_attack", sourceHeroId: "h1" },
			"1/3/2/2",
		);
		expect(result.combat?.ecoTokens?.["h1"]).toBe(2);
	});
});

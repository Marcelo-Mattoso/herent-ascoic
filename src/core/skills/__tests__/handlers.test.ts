import { describe, expect, it } from "vitest";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { handleArmor } from "../handlers/armor";
import { handleDamageBonus } from "../handlers/damage_bonus";
import { handleMarkAndTohit } from "../handlers/mark_and_tohit";
import { handleRecoverDungeon } from "../handlers/recoverDungeon";
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

// ── armor ─────────────────────────────────────────────────────────────────────

describe("handleArmor", () => {
	it("registra damageReduction no combat state", () => {
		const state = makeState();
		const result = handleArmor(state, { triggeredBy: "on_use" }, 1);
		expect(result.combat?.damageReduction?.["h1"]).toBe(1);
	});

	it("acumula com reduction existente", () => {
		const state = makeState(
			{},
			{
				combat: { ...createEmptyCombatState(), damageReduction: { h1: 1 } },
			},
		);
		const result = handleArmor(state, { triggeredBy: "on_use" }, 2);
		expect(result.combat?.damageReduction?.["h1"]).toBe(3);
	});
});

// ── mark_and_tohit ────────────────────────────────────────────────────────────

describe("handleMarkAndTohit", () => {
	it("com 1 inimigo: auto-seleciona como presa", () => {
		const state: GameState = { ...makeState(), activeEnemies: [makeEnemy()] };
		const result = handleMarkAndTohit(
			state,
			{ triggeredBy: "start_of_combat" },
			1,
		);
		expect(result.combat?.prey).toBe("e1");
	});

	it("com 0 inimigos: retorna estado inalterado", () => {
		const state = makeState();
		const result = handleMarkAndTohit(
			state,
			{ triggeredBy: "start_of_combat" },
			1,
		);
		expect(result.combat?.prey).toBeNull();
	});
});

// ── recoverDungeon ────────────────────────────────────────────────────────────

describe("handleRecoverDungeon", () => {
	it("recupera carta do descarte para o deck disponível", () => {
		const state: GameState = {
			...makeState(),
			decks: {
				...createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] }).decks,
				dungeonDeck: {
					available: [],
					discarded: ["Sala A", "Sala B"],
					removed: [],
				},
			},
		};
		const result = handleRecoverDungeon(
			state,
			{ triggeredBy: "once_per_room", sourceHeroId: "h1" },
			1,
		);
		expect(result.decks.dungeonDeck.available.length).toBe(1);
		expect(result.decks.dungeonDeck.discarded.length).toBe(1);
	});

	it("retorna estado com log se descarte vazio", () => {
		const state = makeState();
		const result = handleRecoverDungeon(
			state,
			{ triggeredBy: "once_per_room", sourceHeroId: "h1" },
			1,
		);
		expect(result.eventLog.some((l) => l.includes("vazio"))).toBe(true);
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

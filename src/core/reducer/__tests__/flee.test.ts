// Testes da mecânica de fuga (Patch-8 F3).

import { describe, expect, it, vi } from "vitest";
import "../../skills/handlers/index"; // registra handlers
import { reducer } from "../index";
import { createInitialGameState } from "../../state/gameState";
import { createEmptyCombatState } from "../../state/combatState";
import type { GameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import type { EnemyState } from "../../state/enemyState";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardName: "Bárbaro Rubro",
		maxLife: 10,
		currentLife: 1, // 1 de vida para poder fugir
		damage: 3,
		hitBonus: 1,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		...overrides,
	};
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardName: "Morcego do Teto Negro",
		maxLife: 3,
		currentLife: 3,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function makeState(overrides: Partial<GameState> = {}): GameState {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	return {
		...base,
		heroes: [makeHero()],
		activeEnemies: [makeEnemy()],
		combat: createEmptyCombatState(),
		status: "HERO_ACTION",
		...overrides,
	};
}

// ─── DECLARE_FLEE ─────────────────────────────────────────────────────────────

describe("DECLARE_FLEE", () => {
	it("marca fleeAttemptByHero quando herói tem 1 de vida e há combate", () => {
		const state = makeState();
		const result = reducer(state, { type: "DECLARE_FLEE", payload: { heroId: "h1" } });
		expect(result.combat?.fleeAttemptByHero["h1"]).toBe(true);
	});

	it("ignora se herói tem vida > 1", () => {
		const state = makeState({
			heroes: [makeHero({ currentLife: 5 })],
		});
		const result = reducer(state, { type: "DECLARE_FLEE", payload: { heroId: "h1" } });
		expect(result.combat?.fleeAttemptByHero["h1"]).toBeFalsy();
	});

	it("ignora se não há combate", () => {
		const state = makeState({ combat: null });
		const result = reducer(state, { type: "DECLARE_FLEE", payload: { heroId: "h1" } });
		expect(result.combat).toBeNull();
	});

	it("ignora se fleeBlocked está ativo", () => {
		const state = makeState({ flags: { fleeBlocked: true } });
		const result = reducer(state, { type: "DECLARE_FLEE", payload: { heroId: "h1" } });
		expect(result.combat?.fleeAttemptByHero["h1"]).toBeFalsy();
	});
});

// ─── RESOLVE_ATTACK com fuga ──────────────────────────────────────────────────

describe("handleResolveAttack — fuga", () => {
	it("fuga bem-sucedida: herói vai para fledHeroes, inimigo permanece ativo", () => {
		// Herói total > inimigo total → fuga vence
		const roll = {
			heroId: "h1",
			enemyId: "e1",
			heroResults: [6, 6],
			heroTotal: 13, // alto para garantir vitória
			heroBreakdown: [],
			enemyResults: [1],
			enemyTotal: 1,
			enemyBreakdown: [],
		};
		const state = makeState({
			status: "RESOLVE_ATTACK",
			combat: {
				...createEmptyCombatState(),
				phase: "resolving",
				selectedHeroId: "h1",
				pairs: [{ heroId: "h1", enemyId: "e1" }],
				lastRoll: roll,
				fleeAttemptByHero: { h1: true },
			},
		});

		const result = reducer(state, { type: "RESOLVE_ATTACK" });

		// Herói foi para fledHeroes
		expect(result.fledHeroes).toHaveLength(1);
		expect(result.fledHeroes[0].id).toBe("h1");
		expect(result.fledHeroes[0].status).toBe("fled");

		// Herói saiu de heroes
		expect(result.heroes.find((h) => h.id === "h1")).toBeUndefined();

		// Inimigo permanece ativo (não foi derrotado)
		const enemy = result.activeEnemies.find((e) => e.id === "e1");
		expect(enemy?.status).toBe("active");
	});

	it("fuga fracassada: herói sofre dano normalmente", () => {
		// Herói total <= inimigo total → fuga falha → herói toma dano
		const roll = {
			heroId: "h1",
			enemyId: "e1",
			heroResults: [1],
			heroTotal: 1, // baixo para garantir derrota
			heroBreakdown: [],
			enemyResults: [6],
			enemyTotal: 6,
			enemyBreakdown: [],
		};
		const state = makeState({
			status: "RESOLVE_ATTACK",
			heroes: [makeHero({ currentLife: 1, maxLife: 10 })],
			combat: {
				...createEmptyCombatState(),
				phase: "resolving",
				selectedHeroId: "h1",
				pairs: [{ heroId: "h1", enemyId: "e1" }],
				lastRoll: roll,
				fleeAttemptByHero: { h1: true },
			},
		});

		const result = reducer(state, { type: "RESOLVE_ATTACK" });

		// Herói tomou dano e deve estar derrotado (vida 1 - dano mínimo 1)
		const hero = result.heroes.find((h) => h.id === "h1");
		expect(hero?.currentLife).toBe(0);
		expect(hero?.status).toBe("defeated");

		// Nenhum herói em fledHeroes
		expect(result.fledHeroes).toHaveLength(0);
	});
});

// ─── CHECK_COMBAT_END com fuga ────────────────────────────────────────────────

describe("handleCheckCombatEnd — fuga", () => {
	it("todos fugiram com inimigos vivos → DUNGEON_RESTART_PROMPT", () => {
		const state: GameState = {
			...makeState(),
			status: "CHECK_COMBAT_END",
			heroes: [], // todos saíram
			fledHeroes: [makeHero({ status: "fled" })],
			activeEnemies: [makeEnemy()], // inimigo ainda ativo
		};
		const result = reducer(state, { type: "CHECK_COMBAT_END" });
		expect(result.status).toBe("DUNGEON_RESTART_PROMPT");
	});

	it("derrota sem fuga permanece DEFEAT", () => {
		const state: GameState = {
			...makeState(),
			status: "CHECK_COMBAT_END",
			heroes: [makeHero({ status: "defeated", currentLife: 0 })],
			activeEnemies: [makeEnemy()],
		};
		const result = reducer(state, { type: "CHECK_COMBAT_END" });
		expect(result.status).toBe("DEFEAT");
	});
});

// ─── RESTART_DUNGEON ──────────────────────────────────────────────────────────

describe("RESTART_DUNGEON", () => {
	it("restaura heróis fugidos com vida máxima", () => {
		const state: GameState = {
			...makeState(),
			status: "DUNGEON_RESTART_PROMPT",
			heroes: [],
			fledHeroes: [makeHero({ currentLife: 1, status: "fled" })],
		};
		const result = reducer(state, { type: "RESTART_DUNGEON", payload: { keepEquipment: false } });
		expect(result.heroes).toHaveLength(1);
		expect(result.heroes[0].currentLife).toBe(result.heroes[0].maxLife);
		expect(result.heroes[0].status).toBe("active");
		expect(result.fledHeroes).toHaveLength(0);
	});

	it("com keepEquipment=true, mantém activeItems e backpack", () => {
		const hero = makeHero({
			currentLife: 1,
			status: "fled",
			activeItems: { weapon: "Adaga Enferrujada" },
			backpack: ["Poção de Vigor Menor"],
		});
		const state: GameState = {
			...makeState(),
			status: "DUNGEON_RESTART_PROMPT",
			heroes: [],
			fledHeroes: [hero],
		};
		const result = reducer(state, { type: "RESTART_DUNGEON", payload: { keepEquipment: true } });
		expect(result.heroes[0].activeItems.weapon).toBe("Adaga Enferrujada");
		expect(result.heroes[0].backpack).toContain("Poção de Vigor Menor");
	});

	it("com keepEquipment=false, limpa equipamentos", () => {
		const hero = makeHero({
			currentLife: 1,
			status: "fled",
			activeItems: { weapon: "Adaga Enferrujada" },
			backpack: ["Poção de Vigor Menor"],
		});
		const state: GameState = {
			...makeState(),
			status: "DUNGEON_RESTART_PROMPT",
			heroes: [],
			fledHeroes: [hero],
		};
		const result = reducer(state, { type: "RESTART_DUNGEON", payload: { keepEquipment: false } });
		expect(Object.keys(result.heroes[0].activeItems)).toHaveLength(0);
		expect(result.heroes[0].backpack).toHaveLength(0);
	});
});

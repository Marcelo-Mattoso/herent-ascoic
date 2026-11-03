import { describe, expect, it } from "vitest";
import "../../skills/handlers/index"; // registra handlers
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { reducer } from "../index";
import { testEngine } from "@/core/__tests__/testEngine";
import { enemiesOf, fledHeroesOf, heroesOf, scopedFlagOf, withScopedFlag } from "../../state/access";
import { settled, settledWith, type LooseGame } from "../../__tests__/fixtures";
import { gameOf, withGame } from "../../../engine/state";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 1,
		damage: 3,
		hitBonus: 1,
		dice: 2,
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
		cardId: "creature_dark_cave_bat",
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

function makeState(overrides: Partial<LooseGame> = {}): GameState {
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	return settledWith(base, {
		heroes: [makeHero()],
		activeEnemies: [makeEnemy()],
		combat: createEmptyCombatState(),
		status: "HERO_ACTION",
		...overrides,
	});
}

// ─── DECLARE_FLEE ─────────────────────────────────────────────────────────────

describe("DECLARE_FLEE", () => {
	it("marca fleeAttemptByHero quando herói tem 1 de vida e há combate", () => {
		const state = makeState();
		const result = reducer(testEngine, state, {
			type: "DECLARE_FLEE",
			payload: { heroId: "h1" },
		});
		expect(scopedFlagOf(result, "combat", "fleeAttempt", "h1")).toBe(true);
	});

	it("ignora se herói tem vida > 1", () => {
		const state = makeState({
			heroes: [makeHero({ currentLife: 5 })],
		});
		const result = reducer(testEngine, state, {
			type: "DECLARE_FLEE",
			payload: { heroId: "h1" },
		});
		expect(scopedFlagOf(result, "combat", "fleeAttempt", "h1")).toBeFalsy();
	});

	it("ignora se não há combate", () => {
		const state = makeState({ combat: null });
		const result = reducer(testEngine, state, {
			type: "DECLARE_FLEE",
			payload: { heroId: "h1" },
		});
		expect(gameOf(result).combat).toBeNull();
	});

	it("ignora se fleeBlocked está ativo", () => {
		const state = makeState({ flags: { fleeBlocked: true } });
		const result = reducer(testEngine, state, {
			type: "DECLARE_FLEE",
			payload: { heroId: "h1" },
		});
		expect(scopedFlagOf(result, "combat", "fleeAttempt", "h1")).toBeFalsy();
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
		const state = withScopedFlag(makeState({
			status: "RESOLVE_ATTACK",
			combat: {
				...createEmptyCombatState(),
				phase: "resolving",
				selectedHeroId: "h1",
				pairs: [{ heroId: "h1", enemyId: "e1" }],
				lastRoll: roll,
			},
		}), "combat", "fleeAttempt", "h1");

		const result = reducer(testEngine, state, { type: "RESOLVE_ATTACK" });

		// Herói foi para fledHeroes
		expect(fledHeroesOf(result)).toHaveLength(1);
		expect(fledHeroesOf(result)[0].id).toBe("h1");
		expect(fledHeroesOf(result)[0].status).toBe("fled");

		// Herói saiu de heroes
		expect(heroesOf(result).find((h) => h.id === "h1")).toBeUndefined();

		// Inimigo permanece ativo (não foi derrotado)
		const enemy = enemiesOf(result).find((e) => e.id === "e1");
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
		const state = withScopedFlag(makeState({
			status: "RESOLVE_ATTACK",
			heroes: [makeHero({ currentLife: 1, maxLife: 10 })],
			combat: {
				...createEmptyCombatState(),
				phase: "resolving",
				selectedHeroId: "h1",
				pairs: [{ heroId: "h1", enemyId: "e1" }],
				lastRoll: roll,
			},
		}), "combat", "fleeAttempt", "h1");

		const result = reducer(testEngine, state, { type: "RESOLVE_ATTACK" });

		// Herói tomou dano e deve estar derrotado (vida 1 - dano mínimo 1)
		const hero = heroesOf(result).find((h) => h.id === "h1");
		expect(hero?.currentLife).toBe(0);
		expect(hero?.status).toBe("defeated");

		// Nenhum herói em fledHeroes
		expect(fledHeroesOf(result)).toHaveLength(0);
	});
});

// ─── CHECK_COMBAT_END com fuga ────────────────────────────────────────────────

describe("handleCheckCombatEnd — fuga", () => {
	it("todos fugiram com inimigos vivos → DUNGEON_RESTART_PROMPT", () => {
		const state: GameState = settled(withGame(makeState(), (prevGame) => ({ ...prevGame, status: "CHECK_COMBAT_END", heroes: [], fledHeroes: [makeHero({ status: "fled" })], activeEnemies: [makeEnemy()] })));
		const result = reducer(testEngine, state, { type: "CHECK_COMBAT_END" });
		expect(gameOf(result).status).toBe("DUNGEON_RESTART_PROMPT");
	});

	it("derrota sem fuga permanece DEFEAT", () => {
		const state: GameState = settled(withGame(makeState(), (prevGame) => ({ ...prevGame, status: "CHECK_COMBAT_END", heroes: [makeHero({ status: "defeated", currentLife: 0 })], activeEnemies: [makeEnemy()] })));
		const result = reducer(testEngine, state, { type: "CHECK_COMBAT_END" });
		expect(gameOf(result).status).toBe("DEFEAT");
	});
});

// ─── RESTART_DUNGEON ──────────────────────────────────────────────────────────

describe("RESTART_DUNGEON", () => {
	it("restaura heróis fugidos com vida máxima", () => {
		const state: GameState = settled(withGame(makeState(), (prevGame) => ({ ...prevGame, status: "DUNGEON_RESTART_PROMPT", heroes: [], fledHeroes: [makeHero({ currentLife: 1, status: "fled" })] })));
		const result = reducer(testEngine, state, {
			type: "RESTART_DUNGEON",
			payload: { keepEquipment: false },
		});
		expect(heroesOf(result)).toHaveLength(1);
		expect(heroesOf(result)[0].currentLife).toBe(heroesOf(result)[0].maxLife);
		expect(heroesOf(result)[0].status).toBe("active");
		expect(fledHeroesOf(result)).toHaveLength(0);
	});

	it("com keepEquipment=true, mantém activeItems e backpack", () => {
		const hero = makeHero({
			currentLife: 1,
			status: "fled",
			activeItems: { hand1: "item_rusty_dagger" },
			backpack: ["item_lesser_vigor_potion"],
		});
		const state: GameState = settled(withGame(makeState(), (prevGame) => ({ ...prevGame, status: "DUNGEON_RESTART_PROMPT", heroes: [], fledHeroes: [hero] })));
		const result = reducer(testEngine, state, {
			type: "RESTART_DUNGEON",
			payload: { keepEquipment: true },
		});
		expect(heroesOf(result)[0].activeItems.hand1).toBe("item_rusty_dagger");
		expect(heroesOf(result)[0].backpack).toContain("item_lesser_vigor_potion");
	});

	it("com keepEquipment=false, limpa equipamentos", () => {
		const hero = makeHero({
			currentLife: 1,
			status: "fled",
			activeItems: { hand1: "item_rusty_dagger" },
			backpack: ["item_lesser_vigor_potion"],
		});
		const state: GameState = settled(withGame(makeState(), (prevGame) => ({ ...prevGame, status: "DUNGEON_RESTART_PROMPT", heroes: [], fledHeroes: [hero] })));
		const result = reducer(testEngine, state, {
			type: "RESTART_DUNGEON",
			payload: { keepEquipment: false },
		});
		expect(Object.keys(heroesOf(result)[0].activeItems)).toHaveLength(0);
		expect(heroesOf(result)[0].backpack).toHaveLength(0);
	});
});

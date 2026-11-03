import { describe, expect, it } from "vitest";
import { drainStack } from "../../../effects/resolver";
import { buildScriptCtx } from "../../../scripts/context";
import type { EnemyState } from "../../../state/enemyState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { fireTrigger } from "../../dispatch";
import { evaluate } from "../evaluate";
import "../../handlers/index";
import { testEngine } from "@/core/__tests__/testEngine";
import { awakeningOf, deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { settled } from "../../../__tests__/fixtures";
import { effectStackOf } from "../../../state/access";
import { gameOf, withGame } from "../../../../engine/state";

const CFG = { heroCardIds: ["hero_crimson_barbarian"] };

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 0,
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
		...overrides,
	};
}

function run(state: GameState, trigger: string, ctx: object = {}): GameState {
	return drainStack(testEngine, 
		fireTrigger(testEngine, state, trigger as any, { triggeredBy: trigger as any, ...ctx }),
	);
}

// ── advance_dungeon_level ─────────────────────────────────────────────────────

describe("i_advance_dungeon", () => {
	it("sobe o despertar em value", () => {
		const state = withAwakening(createInitialGameState(CFG), 1);
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "on_use" }, { value: 1 });
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_advance_dungeon", amount: "$value" }], ctx),
		);
		expect(awakeningOf(result)).toBe(2);
	});

	it("não ultrapassa nível 4", () => {
		const state = withAwakening(createInitialGameState(CFG), 3);
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "on_use" }, {});
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_advance_dungeon", amount: 2 }], ctx),
		);
		expect(awakeningOf(result)).toBe(4);
	});
});

// ── discard_from dungeon ──────────────────────────────────────────────────────

describe("discard_from dungeon", () => {
	it("descarta 1 carta do deck de dungeon", () => {
		const base = createInitialGameState(CFG);
		const state: GameState = withDecks({
			...base,
		}, {
				...decksOf(base),
				dungeonDeck: { available: ["A", "B"], discarded: [], removed: [] },
			});
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "on_destroyed" }, {});
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_discard", pile: "dungeon", count: 1 }], ctx),
		);
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1);
	});
});

// ── block_action flee ─────────────────────────────────────────────────────────

describe("block_action flee", () => {
	it("seta fleeBlocked", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "while_active" }, {});
		const result = drainStack(testEngine, 
			evaluate([{ kind: "p_block", what: "flee" }], ctx),
		);
		expect(gameOf(result).flags.fleeBlocked).toBe(true);
	});
});

// ── block_action heal ─────────────────────────────────────────────────────────

describe("block_action heal", () => {
	it("bloqueia cura de todos os heróis ativos", () => {
		const state = settled(withGame(createInitialGameState(CFG), (prevGame) => ({ ...prevGame, heroes: [makeHero()] })));
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "first_round_in_room" },
			{},
		);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "p_block", what: "heal" }], ctx),
		);
		expect(heroesOf(result)[0].healBlocked).toBe(true);
	});
});

// ── block_action dungeon_discard ──────────────────────────────────────────────

describe("block_action dungeon_discard", () => {
	it("seta discardDungeonLocked", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "while_active" }, {});
		const result = drainStack(testEngine, 
			evaluate([{ kind: "p_block", what: "dungeon_discard" }], ctx),
		);
		expect(gameOf(result).flags.discardDungeonLocked).toBe(true);
	});
});

// ── set_no_reward ─────────────────────────────────────────────────────────────

describe("set_no_reward — skill_cowardly_flee via fireTrigger", () => {
	it("marca inimigo-fonte com noReward", () => {
		const enemy = makeEnemy({
			id: "e_goblin",
			cardId: "creature_dark_cave_goblin",
		});
		const state = settled(withGame(createInitialGameState(CFG), (prevGame) => ({ ...prevGame, activeEnemies: [enemy] })));
		const result = run(state, "evt_leave_play", {
			sourceEnemyId: "e_goblin",
		});
		expect(
			enemiesOf(result).find((e) => e.id === "e_goblin")?.noReward,
		).toBe(true);
	});
});

// ── apply_damage to $lowest_life_hero ────────────────────────────────────────

describe("apply_damage to $lowest_life_hero", () => {
	it("causa dano ao herói com menor vida", () => {
		const h1 = makeHero({ id: "h1", currentLife: 8 });
		const h2 = makeHero({ id: "h2", currentLife: 3 });
		const state = settled(withGame(createInitialGameState(CFG), (prevGame) => ({ ...prevGame, heroes: [h1, h2] })));
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "on_use" }, { value: 2 });
		const result = drainStack(testEngine, 
			evaluate(
				[{ kind: "i_damage", to: "$lowest_life_hero", amount: "$value" }],
				ctx,
			),
		);
		expect(heroesOf(result).find((h) => h.id === "h2")?.currentLife).toBe(1);
		expect(heroesOf(result).find((h) => h.id === "h1")?.currentLife).toBe(8);
	});
});

// ── apply_heal to $target ─────────────────────────────────────────────────────

describe("apply_heal to $target — skill_last_light_healing", () => {
	it("cura herói-alvo pelo valor da skill", () => {
		const hero = makeHero({ currentLife: 5 });
		const state = settled(withGame(createInitialGameState(CFG), (prevGame) => ({ ...prevGame, heroes: [hero] })));
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "on_use", targetHeroIds: ["h1"] },
			{ value: 3 },
		);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_heal", to: "$target", amount: "$value" }], ctx),
		);
		expect(heroesOf(result)[0].currentLife).toBe(8);
	});
});

// ── for_each all_heroes + apply_damage ───────────────────────────────────────

describe("for_each all_heroes — purple_raging_flames", () => {
	it("causa 1 de dano a cada herói ativo", () => {
		const h1 = makeHero({ id: "h1", currentLife: 5 });
		const h2 = makeHero({ id: "h2", currentLife: 7 });
		const state = settled(withGame(createInitialGameState(CFG), (prevGame) => ({ ...prevGame, heroes: [h1, h2] })));
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "on_enter_play" }, {});
		const result = drainStack(testEngine, 
			evaluate(
				[
					{
						kind: "i_for_each",
						over: "all_heroes",
						as: "$loopTarget",
						do: [{ kind: "i_damage", to: "$target", amount: 1 }],
					},
				],
				ctx,
			),
		);
		expect(heroesOf(result).find((h) => h.id === "h1")?.currentLife).toBe(4);
		expect(heroesOf(result).find((h) => h.id === "h2")?.currentLife).toBe(6);
	});
});

// ── noop ──────────────────────────────────────────────────────────────────────

describe("i_noop", () => {
	it("state inalterado", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(testEngine, state, { triggeredBy: "room_passive" }, {});
		const result = drainStack(testEngine, evaluate([{ kind: "i_noop" }], ctx));
		expect(effectStackOf(result).pending).toHaveLength(0);
	});
});

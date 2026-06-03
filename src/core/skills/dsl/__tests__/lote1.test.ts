// Testes de aceite Lote 1 (Patch-12 Fase 3).
// Verifica habilidades reais via fireTrigger + drainStack.

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

const CFG = { heroCardNames: ["Bárbaro Rubro"] };

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		cardName: "Bárbaro Rubro",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
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
	return drainStack(
		fireTrigger(state, trigger as any, { triggeredBy: trigger as any, ...ctx }),
	);
}

// ── advance_dungeon_level ─────────────────────────────────────────────────────

describe("advance_dungeon_level", () => {
	it("sobe o despertar em value", () => {
		const state = { ...createInitialGameState(CFG), despertar: 1 as const };
		const ctx = buildScriptCtx(state, { triggeredBy: "on_use" }, { value: 1 });
		const result = drainStack(
			evaluate([{ kind: "advance_dungeon_level", amount: "$value" }], ctx),
		);
		expect(result.despertar).toBe(2);
	});

	it("não ultrapassa nível 4", () => {
		const state = { ...createInitialGameState(CFG), despertar: 3 as const };
		const ctx = buildScriptCtx(state, { triggeredBy: "on_use" }, {});
		const result = drainStack(
			evaluate([{ kind: "advance_dungeon_level", amount: 2 }], ctx),
		);
		expect(result.despertar).toBe(4);
	});
});

// ── discard_from dungeon ──────────────────────────────────────────────────────

describe("discard_from dungeon", () => {
	it("descarta 1 carta do deck de dungeon", () => {
		const base = createInitialGameState(CFG);
		const state: GameState = {
			...base,
			decks: {
				...base.decks,
				dungeonDeck: { available: ["A", "B"], discarded: [], removed: [] },
			},
		};
		const ctx = buildScriptCtx(state, { triggeredBy: "on_destroyed" }, {});
		const result = drainStack(
			evaluate([{ kind: "discard_from", pile: "dungeon", count: 1 }], ctx),
		);
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
	});
});

// ── block_action flee ─────────────────────────────────────────────────────────

describe("block_action flee", () => {
	it("seta fleeBlocked", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(state, { triggeredBy: "while_active" }, {});
		const result = drainStack(
			evaluate([{ kind: "block_action", what: "flee" }], ctx),
		);
		expect(result.flags.fleeBlocked).toBe(true);
	});
});

// ── block_action heal ─────────────────────────────────────────────────────────

describe("block_action heal", () => {
	it("bloqueia cura de todos os heróis ativos", () => {
		const state = { ...createInitialGameState(CFG), heroes: [makeHero()] };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "first_round_in_room" },
			{},
		);
		const result = drainStack(
			evaluate([{ kind: "block_action", what: "heal" }], ctx),
		);
		expect(result.heroes[0].healBlocked).toBe(true);
	});
});

// ── block_action dungeon_discard ──────────────────────────────────────────────

describe("block_action dungeon_discard", () => {
	it("seta discardDungeonLocked", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(state, { triggeredBy: "while_active" }, {});
		const result = drainStack(
			evaluate([{ kind: "block_action", what: "dungeon_discard" }], ctx),
		);
		expect(result.flags.discardDungeonLocked).toBe(true);
	});
});

// ── set_no_reward ─────────────────────────────────────────────────────────────

describe("set_no_reward — skill_cowardly_flee via fireTrigger", () => {
	it("marca inimigo-fonte com noReward", () => {
		const enemy = makeEnemy({
			id: "e_goblin",
			cardId: "creature_dark_cave_goblin",
		});
		const state = { ...createInitialGameState(CFG), activeEnemies: [enemy] };
		const result = run(state, "evt_leave_play", {
			sourceEnemyId: "e_goblin",
		});
		expect(
			result.activeEnemies.find((e) => e.id === "e_goblin")?.noReward,
		).toBe(true);
	});
});

// ── apply_damage to $lowest_life_hero ────────────────────────────────────────

describe("apply_damage to $lowest_life_hero", () => {
	it("causa dano ao herói com menor vida", () => {
		const h1 = makeHero({ id: "h1", currentLife: 8 });
		const h2 = makeHero({ id: "h2", currentLife: 3 });
		const state = { ...createInitialGameState(CFG), heroes: [h1, h2] };
		const ctx = buildScriptCtx(state, { triggeredBy: "on_use" }, { value: 2 });
		const result = drainStack(
			evaluate(
				[{ kind: "apply_damage", to: "$lowest_life_hero", amount: "$value" }],
				ctx,
			),
		);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(1);
		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(8);
	});
});

// ── apply_heal to $target ─────────────────────────────────────────────────────

describe("apply_heal to $target — skill_last_light_healing", () => {
	it("cura herói-alvo pelo valor da skill", () => {
		const hero = makeHero({ currentLife: 5 });
		const state = { ...createInitialGameState(CFG), heroes: [hero] };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", targetHeroIds: ["h1"] },
			{ value: 3 },
		);
		const result = drainStack(
			evaluate([{ kind: "apply_heal", to: "$target", amount: "$value" }], ctx),
		);
		expect(result.heroes[0].currentLife).toBe(8);
	});
});

// ── for_each all_heroes + apply_damage ───────────────────────────────────────

describe("for_each all_heroes — purple_raging_flames", () => {
	it("causa 1 de dano a cada herói ativo", () => {
		const h1 = makeHero({ id: "h1", currentLife: 5 });
		const h2 = makeHero({ id: "h2", currentLife: 7 });
		const state = { ...createInitialGameState(CFG), heroes: [h1, h2] };
		const ctx = buildScriptCtx(state, { triggeredBy: "on_enter_play" }, {});
		const result = drainStack(
			evaluate(
				[
					{
						kind: "for_each",
						over: "all_heroes",
						as: "$loopTarget",
						do: [{ kind: "apply_damage", to: "$target", amount: 1 }],
					},
				],
				ctx,
			),
		);
		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(4);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(6);
	});
});

// ── noop ──────────────────────────────────────────────────────────────────────

describe("noop", () => {
	it("state inalterado", () => {
		const state = createInitialGameState(CFG);
		const ctx = buildScriptCtx(state, { triggeredBy: "room_passive" }, {});
		const result = drainStack(evaluate([{ kind: "noop" }], ctx));
		expect(result.effectStack.pending).toHaveLength(0);
	});
});

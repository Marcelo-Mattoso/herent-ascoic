import { describe, expect, it } from "vitest";
import { spawnHero } from "../../../state/access";
import type { ModifierComponent } from "../../../ecs/types";
import { addComponent, getModifierTotal } from "../../../ecs/world";
import { drainStack } from "../../../effects/resolver";
import { handleRollDice } from "../../../reducer/combat";
import { handleGrantRewards } from "../../../reducer/reward";
import { buildScriptCtx } from "../../../scripts/context";
import { createEmptyCombatState } from "../../../state/combatState";
import type { EnemyState } from "../../../state/enemyState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import type { RoomState } from "../../../state/roomState";
import { evaluate } from "../../dsl/evaluate";
import { testEngine } from "@/core/__tests__/testEngine";
import { awakeningOf, deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { settledWith, type LooseGame } from "../../../__tests__/fixtures";
import { gameOf, withGame } from "../../../../engine/state";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
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

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
	return {
		cardId: "room_narrow_corridor",
		exits: 2,
		currentEnemies: 1,
		reward: 0,
		rewardType: "item",
		effect: "",
		xp: 1,
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
		combat: createEmptyCombatState(),
		...overrides,
	});
}

function makeEvalCtx(state: GameState, sourceId?: string, _targetId?: string) {
	return buildScriptCtx(testEngine, state, {
		triggeredBy: "on_use",
		sourceHeroId: sourceId,
		sourceEnemyId: sourceId,
	});
}

// ── DSL add_modifier stat:"s_hit_penalty" (antigo handleTohitPenalty) ────────

describe("DSL add_modifier tohit_penalty", () => {
	it("seta tohit_penalty no ECS world (hit_bonus negativo) — patch-18 Lote G", () => {
		const state = makeState();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(testEngine, 
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_hit_penalty",
						operation: "add",
						value: 2,
						duration: { kind: "once" },
					},
				],
				ctx,
			),
		);
		// tohit_penalty → hit_bonus negativo no ECS world
		expect(getModifierTotal(gameOf(result).world, "h1", "hit_bonus")).toBe(-2);
	});

	it("acumula penalidade em múltiplas aplicações no ECS world", () => {
		const state = makeState();
		const ctx1 = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const r1 = drainStack(testEngine, 
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_hit_penalty",
						operation: "add",
						value: 1,
						duration: { kind: "once" },
					},
				],
				ctx1,
			),
		);
		const ctx2 = buildScriptCtx(testEngine, 
			r1,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const r2 = drainStack(testEngine, 
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_hit_penalty",
						operation: "add",
						value: 1,
						duration: { kind: "once" },
					},
				],
				ctx2,
			),
		);
		expect(getModifierTotal(gameOf(r2).world, "h1", "hit_bonus")).toBe(-2);
	});

	it("heroBreakdown inclui entrada de penalidade após handleRollDice", () => {
		const combat = {
			...createEmptyCombatState(),
			pairs: [{ heroId: "h1", enemyId: "e1" }],
		};
		const hero = makeHero({ cardId: "hero_eternal_rest_cleric" });
		const base = makeState({
			combat,
			heroes: [hero],
			activeEnemies: [makeEnemy()],
		});
		// Popula ECS world com o modifier de penalidade
		const penMod: ModifierComponent = {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: -2,
			source: "skill_scorching_heat",
			duration: { kind: "this_combat" },
		};
		let world = spawnHero(gameOf(base).world, hero);
		world = addComponent(world, hero.id, penMod);
		const state = withGame(base, (prevGame) => ({ ...prevGame, world }));
		const result = handleRollDice(testEngine, state);
		// A nova leitura usa source do ModifierComponent (não mais a string "penalidade")
		const penEntry = gameOf(result).combat?.lastRoll?.heroBreakdown.find(
			(b) => b.value === -2,
		);
		expect(penEntry).toEqual({ source: "skill_scorching_heat", value: -2 });
	});
});

// ── block_action heal (antigo heal_block) — via DSL + drainStack ──────────────

describe("DSL block_action heal", () => {
	it("marca healBlocked no herói quando efeito é drenado", () => {
		const state = makeState();
		const ctx = makeEvalCtx(state);
		const intermediate = evaluate([{ kind: "p_block", what: "heal" }], ctx);
		const result = drainStack(testEngine, intermediate);
		expect(heroesOf(result)[0].healBlocked).toBe(true);
	});
});

// ── block_action dungeon_discard (antigo discardDungeonLock) ─────────────────

describe("DSL block_action dungeon_discard", () => {
	it("liga flags.discardDungeonLocked após drenagem", () => {
		const state = makeState();
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "p_block", what: "dungeon_discard" }], ctx),
		);
		expect(gameOf(result).flags.discardDungeonLocked).toBe(true);
	});
});

// ── discard_from dungeon (antigo discardDungeon) ──────────────────────────────

describe("DSL discard_from dungeon", () => {
	it("descarta N cartas do deck de dungeon após drenagem", () => {
		const state = withDecks(makeState({
		}), {
				...decksOf(createInitialGameState({ heroCardIds: [] })),
				dungeonDeck: {
					available: ["Sala A", "Sala B", "Sala C"],
					discarded: [],
					removed: [],
				},
			});
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_discard", pile: "dungeon", count: 1 }], ctx),
		);
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(2);
		expect(deckOf(result, "dungeonDeck").discarded).toContain("Sala A");
	});

	it("descarta 2 cartas quando count é 2", () => {
		const state = withDecks(makeState({
		}), {
				...decksOf(createInitialGameState({ heroCardIds: [] })),
				dungeonDeck: { available: ["A", "B", "C"], discarded: [], removed: [] },
			});
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_discard", pile: "dungeon", count: 2 }], ctx),
		);
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1);
	});
});

// ── set_no_reward (antigo reward) ─────────────────────────────────────────────

describe("DSL set_no_reward", () => {
	it("marca a criatura-fonte com noReward = true após drenagem", () => {
		const state = makeState({ activeEnemies: [makeEnemy()] });
		const ctx = buildScriptCtx(testEngine, state, {
			triggeredBy: "on_leave_play",
			sourceEnemyId: "e1",
			skillId: "skill_cowardly_flee",
		});
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_set_no_reward", to: "$source" }], ctx),
		);
		const enemy = enemiesOf(result).find((e) => e.id === "e1");
		expect(enemy?.noReward).toBe(true);
	});

	it("handleGrantRewards não gera itens de inimigo com noReward", () => {
		const defeatedEnemy: EnemyState = {
			...makeEnemy({ id: "e1", status: "defeated", noReward: true }),
			tokens: { reward_item: 1 },
		};
		const state = withDecks(makeState({
			currentRoom: makeRoom({
				reward: 0,
				rewardType: "item",
				status: "cleared",
			}),
			activeEnemies: [],
			enemyGraveyard: [defeatedEnemy],
		}), {
				...decksOf(createInitialGameState({ heroCardIds: [] })),
				itemDeck: {
					available: ["Adaga Enferrujada"],
					discarded: [],
					removed: [],
				},
			});
		const result = handleGrantRewards(testEngine, state);
		expect(gameOf(result).pendingRewards.filter((r) => r.type === "item")).toHaveLength(
			0,
		);
	});
});

// ── advance_dungeon_level (antigo dungeonLevel) ───────────────────────────────

describe("DSL advance_dungeon_level", () => {
	it("incrementa despertar em N após drenagem", () => {
		const state = withAwakening(makeState(), 1);
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_advance_dungeon", amount: 2 }], ctx),
		);
		expect(awakeningOf(result)).toBe(3);
	});

	it("não ultrapassa nível 4 (máx)", () => {
		const state = withAwakening(makeState(), 3);
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_advance_dungeon", amount: 2 }], ctx),
		);
		expect(awakeningOf(result)).toBe(4);
	});
});

// ── block_action flee (antigo flee_block) ────────────────────────────────────

describe("DSL block_action flee", () => {
	it("liga flags.fleeBlocked após drenagem", () => {
		const state = makeState();
		const ctx = makeEvalCtx(state);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "p_block", what: "flee" }], ctx),
		);
		expect(gameOf(result).flags.fleeBlocked).toBe(true);
	});
});

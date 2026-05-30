// Testes da Onda A do patch-8 + Lote 1 do patch-12.
//
// Patch-12 Lote 1: handlers deletados (discardDungeon, reward, discardDungeonLock,
// flee_block, heal_block, dungeonLevel) foram absorvidos pela DSL.
// Seus testes foram portados para verificar o comportamento via drainStack.

import { describe, expect, it } from "vitest";
import { syncEntityFromHero } from "../../../ecs/sync";
import type { ModifierComponent } from "../../../ecs/types";
import { addComponent } from "../../../ecs/world";
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

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		cardName: "Bárbaro Rubro",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 1,
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
		cardName: "Goblin das Cavernas Escuras",
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
		cardName: "Corredor Estreito",
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

function makeState(overrides: Partial<GameState> = {}): GameState {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	return {
		...base,
		heroes: [makeHero()],
		combat: createEmptyCombatState(),
		...overrides,
	};
}

function makeEvalCtx(state: GameState, sourceId?: string, _targetId?: string) {
	return buildScriptCtx(state, {
		triggeredBy: "on_use",
		sourceHeroId: sourceId,
		sourceEnemyId: sourceId,
	});
}

// ── DSL add_modifier stat:"tohit_penalty" (antigo handleTohitPenalty) ────────

describe("DSL add_modifier tohit_penalty", () => {
	it("seta tohitPenaltyByHero após drainStack", () => {
		const state = makeState();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "add_modifier",
						to: "$source",
						stat: "tohit_penalty",
						operation: "add",
						value: 2,
						duration: { kind: "once" },
					},
				],
				ctx,
			),
		);
		expect(result.combat?.tohitPenaltyByHero["h1"]).toBe(2);
	});

	it("acumula penalidade em múltiplas aplicações", () => {
		const state = makeState();
		const ctx1 = buildScriptCtx(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const r1 = drainStack(
			evaluate(
				[
					{
						kind: "add_modifier",
						to: "$source",
						stat: "tohit_penalty",
						operation: "add",
						value: 1,
						duration: { kind: "once" },
					},
				],
				ctx1,
			),
		);
		const ctx2 = buildScriptCtx(
			r1,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			{},
		);
		const r2 = drainStack(
			evaluate(
				[
					{
						kind: "add_modifier",
						to: "$source",
						stat: "tohit_penalty",
						operation: "add",
						value: 1,
						duration: { kind: "once" },
					},
				],
				ctx2,
			),
		);
		expect(r2.combat?.tohitPenaltyByHero["h1"]).toBe(2);
	});

	it("heroBreakdown inclui entrada de penalidade após handleRollDice", () => {
		const combat = {
			...createEmptyCombatState(),
			pairs: [{ heroId: "h1", enemyId: "e1" }],
			// legacy mantido por dual-write; leitura agora vem do ECS (Lote C)
			tohitPenaltyByHero: { h1: 2 },
		};
		const hero = makeHero();
		const base = makeState({ combat, activeEnemies: [makeEnemy()] });
		// Popula ECS world com o modifier de penalidade
		const penMod: ModifierComponent = {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: -2,
			source: "skill_scorching_heat",
			duration: { kind: "this_combat" },
		};
		let world = syncEntityFromHero(base.world, hero);
		world = addComponent(world, hero.id, penMod);
		const state = { ...base, world };
		const result = handleRollDice(state);
		// A nova leitura usa source do ModifierComponent (não mais a string "penalidade")
		const penEntry = result.combat?.lastRoll?.heroBreakdown.find(
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
		const intermediate = evaluate(
			[{ kind: "block_action", what: "heal" }],
			ctx,
		);
		const result = drainStack(intermediate);
		expect(result.heroes[0].healBlocked).toBe(true);
	});

});

// ── block_action dungeon_discard (antigo discardDungeonLock) ─────────────────

describe("DSL block_action dungeon_discard", () => {
	it("liga flags.discardDungeonLocked após drenagem", () => {
		const state = makeState();
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "block_action", what: "dungeon_discard" }], ctx),
		);
		expect(result.flags.discardDungeonLocked).toBe(true);
	});

});

// ── discard_from dungeon (antigo discardDungeon) ──────────────────────────────

describe("DSL discard_from dungeon", () => {
	it("descarta N cartas do deck de dungeon após drenagem", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: {
					available: ["Sala A", "Sala B", "Sala C"],
					discarded: [],
					removed: [],
				},
			},
		});
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "discard_from", pile: "dungeon", count: 1 }], ctx),
		);
		expect(result.decks.dungeonDeck.available).toHaveLength(2);
		expect(result.decks.dungeonDeck.discarded).toContain("Sala A");
	});

	it("descarta 2 cartas quando count é 2", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["A", "B", "C"], discarded: [], removed: [] },
			},
		});
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "discard_from", pile: "dungeon", count: 2 }], ctx),
		);
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
	});
});

// ── set_no_reward (antigo reward) ─────────────────────────────────────────────

describe("DSL set_no_reward", () => {
	it("marca a criatura-fonte com noReward = true após drenagem", () => {
		const state = makeState({ activeEnemies: [makeEnemy()] });
		const ctx = buildScriptCtx(state, {
			triggeredBy: "on_leave_play",
			sourceEnemyId: "e1",
			skillId: "skill_cowardly_flee",
		});
		const result = drainStack(
			evaluate([{ kind: "set_no_reward", to: "$source" }], ctx),
		);
		const enemy = result.activeEnemies.find((e) => e.id === "e1");
		expect(enemy?.noReward).toBe(true);
	});

	it("handleGrantRewards não gera itens de inimigo com noReward", () => {
		const defeatedEnemy: EnemyState = {
			...makeEnemy({ id: "e1", status: "defeated", noReward: true }),
			tokens: { reward_item: 1 },
		};
		const state = makeState({
			currentRoom: makeRoom({
				reward: 0,
				rewardType: "item",
				status: "cleared",
			}),
			activeEnemies: [],
			enemyGraveyard: [defeatedEnemy],
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				itemDeck: {
					available: ["Adaga Enferrujada"],
					discarded: [],
					removed: [],
				},
			},
		});
		const result = handleGrantRewards(state);
		expect(result.pendingRewards.filter((r) => r.type === "item")).toHaveLength(
			0,
		);
	});
});

// ── advance_dungeon_level (antigo dungeonLevel) ───────────────────────────────

describe("DSL advance_dungeon_level", () => {
	it("incrementa despertar em N após drenagem", () => {
		const state = { ...makeState(), despertar: 1 as const };
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "advance_dungeon_level", amount: 2 }], ctx),
		);
		expect(result.despertar).toBe(3);
	});

	it("não ultrapassa nível 4 (máx)", () => {
		const state = { ...makeState(), despertar: 3 as const };
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "advance_dungeon_level", amount: 2 }], ctx),
		);
		expect(result.despertar).toBe(4);
	});
});

// ── block_action flee (antigo flee_block) ────────────────────────────────────

describe("DSL block_action flee", () => {
	it("liga flags.fleeBlocked após drenagem", () => {
		const state = makeState();
		const ctx = makeEvalCtx(state);
		const result = drainStack(
			evaluate([{ kind: "block_action", what: "flee" }], ctx),
		);
		expect(result.flags.fleeBlocked).toBe(true);
	});
});

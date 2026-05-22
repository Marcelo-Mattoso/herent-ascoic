// Testes da Onda A do patch-8: handlers puros sem UI.
// Cada describe cobre 1 handler com pelo menos 1 cenário de aceite.

import { describe, expect, it } from "vitest";
import { handleTohitPenalty } from "../tohit_penalty";
import { handleHealBlock } from "../heal_block";
import { handleDiscardDungeonLock } from "../discardDungeonLock";
import { handleDiscardDungeon } from "../discardDungeon";
import { handleReward } from "../reward";
import { handleHeal } from "../heal";
import { handleDiscardDungeonPrevention } from "../discardDungeon_prevention";
import { handleGrantRewards } from "../../../reducer/reward";
import { handleRollDice } from "../../../reducer/combat";
import { createInitialGameState } from "../../../state/gameState";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import type { EnemyState } from "../../../state/enemyState";
import type { RoomState } from "../../../state/roomState";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
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

// ── tohit_penalty ─────────────────────────────────────────────────────────────

describe("handleTohitPenalty", () => {
	it("seta tohitPenaltyByHero para o herói atacante", () => {
		const state = makeState();
		const result = handleTohitPenalty(
			state,
			{ triggeredBy: "before_attack", sourceHeroId: "h1" },
			2,
		);
		expect(result.combat?.tohitPenaltyByHero["h1"]).toBe(2);
	});

	it("acumula penalidade se chamado múltiplas vezes", () => {
		const state = makeState();
		const r1 = handleTohitPenalty(state, { triggeredBy: "before_attack", sourceHeroId: "h1" }, 1);
		const r2 = handleTohitPenalty(r1, { triggeredBy: "before_attack", sourceHeroId: "h1" }, 1);
		expect(r2.combat?.tohitPenaltyByHero["h1"]).toBe(2);
	});

	it("heroBreakdown inclui entrada de penalidade após handleRollDice", () => {
		const combat = {
			...createEmptyCombatState(),
			pairs: [{ heroId: "h1", enemyId: "e1" }],
			tohitPenaltyByHero: { h1: 2 },
		};
		const state = makeState({ combat, activeEnemies: [makeEnemy()] });
		const result = handleRollDice(state);
		const breakdown = result.combat?.lastRoll?.heroBreakdown ?? [];
		const penEntry = breakdown.find((b) => b.source === "penalidade");
		expect(penEntry).toEqual({ source: "penalidade", value: -2 });
	});
});

// ── heal_block ────────────────────────────────────────────────────────────────

describe("handleHealBlock", () => {
	it("marca healBlocked no herói-fonte", () => {
		const state = makeState();
		const result = handleHealBlock(
			state,
			{ triggeredBy: "on_enter_room", sourceHeroId: "h1" },
			null,
		);
		expect(result.heroes[0].healBlocked).toBe(true);
	});

	it("handleHeal não cura herói com healBlocked", () => {
		const state = makeState({ heroes: [makeHero({ currentLife: 5, healBlocked: true })] });
		const result = handleHeal(
			state,
			{ triggeredBy: "on_use", sourceHeroId: "h1" },
			3,
		);
		expect(result.heroes[0].currentLife).toBe(5);
	});
});

// ── discardDungeonLock ────────────────────────────────────────────────────────

describe("handleDiscardDungeonLock", () => {
	it("liga flags.discardDungeonLocked", () => {
		const state = makeState();
		const result = handleDiscardDungeonLock(state, { triggeredBy: "while_in_play" }, null);
		expect(result.flags.discardDungeonLocked).toBe(true);
	});

	it("handleDiscardDungeonPrevention é anulado quando locked", () => {
		const state = {
			...makeState({ heroes: [makeHero()] }),
			flags: { discardDungeonLocked: true },
		};
		const before = state.eventLog.length;
		const result = handleDiscardDungeonPrevention(
			state,
			{ triggeredBy: "on_dungeon_discard", sourceHeroId: "h1" },
			null,
		);
		// Log deve mencionar "bloqueado"
		const newLogs = result.eventLog.slice(before);
		expect(newLogs.some((l) => l.includes("bloqueado"))).toBe(true);
		// E a prevenção não deve ter efeito (log de prevenção não ocorre)
		expect(newLogs.some((l) => l.includes("cancelado"))).toBe(false);
	});
});

// ── discardDungeon ────────────────────────────────────────────────────────────

describe("handleDiscardDungeon", () => {
	it("descarta N cartas do deck de dungeon", () => {
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
		const result = handleDiscardDungeon(state, { triggeredBy: "on_destroyed" }, 1);
		expect(result.decks.dungeonDeck.available).toHaveLength(2);
		expect(result.decks.dungeonDeck.discarded).toContain("Sala A");
	});

	it("descarta 2 cartas quando value é 2", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: {
					available: ["A", "B", "C"],
					discarded: [],
					removed: [],
				},
			},
		});
		const result = handleDiscardDungeon(state, { triggeredBy: "on_destroyed" }, 2);
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
	});
});

// ── reward (impedir recompensa) ───────────────────────────────────────────────

describe("handleReward (noReward)", () => {
	it("marca a criatura-fonte com noReward = true", () => {
		const state = makeState({ activeEnemies: [makeEnemy()] });
		const result = handleReward(
			state,
			{ triggeredBy: "on_enter_play", sourceEnemyId: "e1" },
			null,
		);
		const enemy = result.activeEnemies.find((e) => e.id === "e1");
		expect(enemy?.noReward).toBe(true);
	});

	it("handleGrantRewards não gera itens de inimigo com noReward", () => {
		// Inimigo no cemitério com noReward e token de item
		const defeatedEnemy: EnemyState = {
			...makeEnemy({ id: "e1", status: "defeated", noReward: true }),
			tokens: { reward_item: 1 },
		};
		const state = makeState({
			currentRoom: makeRoom({ reward: 0, rewardType: "item", status: "cleared" }),
			activeEnemies: [],
			enemyGraveyard: [defeatedEnemy],
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				itemDeck: { available: ["Adaga Enferrujada"], discarded: [], removed: [] },
			},
		});
		// Sem noReward, o token reward_item adicionaria 1 item
		// Com noReward, deve ficar 0 itens
		const result = handleGrantRewards(state);
		expect(result.pendingRewards.filter((r) => r.type === "item")).toHaveLength(0);
	});
});

import { describe, expect, it } from "vitest";
import { eventsOfType, lastEventOfType } from "../../../engine/events";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import type { RoomState } from "../../state/roomState";
import { reducer } from "../../reducer/index";
import { lowerDespertar } from "../../reducer/progression";
import { applyDamage } from "../../systems/damageSystem";
import { applyHeal } from "../../systems/healSystem";
import { recordEvent } from "../record";
import type { Action } from "../../actions/types";
import type { GameEvent } from "../types";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled, settledWith, type LooseGame } from "../../__tests__/fixtures";
import { decksOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { withGame, gameOf } from "../../../engine/state";

const HERO = "hero_crimson_barbarian";

function hero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: HERO,
		maxLife: 10,
		currentLife: 10,
		damage: 4,
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

function enemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardId: "creature_deep_rift_rat",
		maxLife: 1,
		currentLife: 1,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: { xp: 1, reward_item: 0, reward_artifact: 0 },
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function base(overrides: Partial<LooseGame> = {}): GameState {
	return settledWith(createInitialGameState({ heroCardIds: [HERO] }), {
		heroes: [hero()],
		activeEnemies: [enemy()],
		combat: createEmptyCombatState(),
		...overrides,
	});
}

const room: RoomState = {
	cardId: "room_dungeon_room",
	exits: 2,
	currentEnemies: 1,
	reward: 0,
	rewardType: "item",
	effect: "",
	xp: 1,
	status: "active",
};

function playRoomUntilReward(trace: GameEvent[][] = []): GameState {
	const started = reducer(testEngine, createInitialGameState({ heroCardIds: [HERO] }), {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
	const h = heroesOf(started)[0] as HeroState;
	let s: GameState = withDecks(settled(withGame(started, (prevGame) => ({ ...prevGame, heroes: [{ ...h, hitBonus: 100 }], currentRoom: room, activeEnemies: [enemy()], status: "COMBAT_START", oncePer: {
			...gameOf(started).oncePer,
			game: {
				...gameOf(started).oncePer.game,
				[`power_mighty_crimson_fury::${h.id}`]: true,
			},
		} }))), {
			...decksOf(started),
			itemDeck: { available: [], discarded: [], removed: [] },
		});
	const step = (action: Action) => {
		s = reducer(testEngine, s, action);
		trace.push([...gameOf(s).events]);
	};
	step({ type: "START_COMBAT" });
	step({ type: "CHOOSE_TARGET", payload: { heroId: h.id, enemyId: "e1" } });
	step({ type: "ROLL_DICE" });
	step({ type: "RESOLVE_ATTACK" });
	step({ type: "CHECK_COMBAT_END" });
	return s;
}

describe("eventos estruturados", () => {
	it("dano emite DamageDealt com tipo e valor final", () => {
		const s = applyDamage(testEngine, base(), "h1", 3, {
			sourceId: "e1",
			damageType: "magical",
		});
		const dealt = eventsOfType(gameOf(s).events, "DamageDealt");
		expect(dealt).toHaveLength(1);
		expect(dealt[0]?.payload).toEqual({
			sourceId: "e1",
			targetId: "h1",
			damageType: "magical",
			amount: 3,
		});
		expect(eventsOfType(gameOf(s).events, "DamageAboutToBeDealt")).toHaveLength(0);
	});

	it("dano roxo preserva o tipo purple no evento", () => {
		const s = applyDamage(testEngine, base(), "h1", 2, { damageType: "purple" });
		expect(lastEventOfType(gameOf(s).events, "DamageDealt")?.payload.damageType).toBe(
			"purple",
		);
	});

	it("cura emite HealApplied com a quantidade efetivamente curada", () => {
		const s = applyHeal(testEngine, base({ heroes: [hero({ currentLife: 8 })] }), "h1", 5);
		expect(lastEventOfType(gameOf(s).events, "HealApplied")?.payload).toEqual({
			targetId: "h1",
			amount: 2,
		});
	});

	it("dano letal emite HeroDefeated", () => {
		const s = applyDamage(testEngine, 
			base({ heroes: [hero({ currentLife: 2 })] }),
			"h1",
			5,
			{
				sourceId: "e1",
			},
		);
		expect(lastEventOfType(gameOf(s).events, "HeroDefeated")?.payload).toEqual({
			heroId: "h1",
			sourceId: "e1",
		});
	});

	it("dano letal em inimigo emite EnemyDestroyed", () => {
		const s = applyDamage(testEngine, base(), "e1", 5, { sourceId: "h1" });
		expect(lastEventOfType(gameOf(s).events, "EnemyDestroyed")?.payload).toMatchObject({
			enemyId: "e1",
			sourceId: "h1",
		});
	});

	it("rolagem e transição de status aparecem como eventos no loop de combate", () => {
		const trace: GameEvent[][] = [];
		const s = playRoomUntilReward(trace);
		const all = trace.flat();
		const rolls = eventsOfType(all, "RollResolved");
		expect(rolls).toHaveLength(1);
		const roll = rolls[0]?.payload;
		expect(roll?.enemyId).toBe("e1");
		expect(roll?.heroResults.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

		const transitions = eventsOfType(all, "StatusChanged").map(
			(e) => `${e.payload.from}>${e.payload.to}`,
		);
		expect(transitions).toContain("ROLL_DICE>RESOLVE_ATTACK");
		expect(gameOf(s).status).toBe("REWARD_PHASE");
		expect(lastEventOfType(all, "StatusChanged")?.payload.to).toBe(
			"REWARD_PHASE",
		);
	});

	it("state.events guarda só o log da última action", () => {
		const trace: GameEvent[][] = [];
		playRoomUntilReward(trace);
		const rollAction = trace.find((events) =>
			events.some((e) => e.type === "RollResolved"),
		);
		expect(rollAction).toBeDefined();
		expect(trace.filter((events) => events.some((e) => e.type === "RollResolved"))).toHaveLength(1);
		const [, , , , last] = trace;
		expect(last?.some((e) => e.type === "RollResolved")).toBe(false);
		const seqs = (last ?? []).map((e) => e.seq);
		expect(seqs).toEqual(seqs.map((_, i) => i));
	});

	it("RollResolved vem antes dos eventos pós-rolagem da mesma action (seq)", () => {
		const trace: GameEvent[][] = [];
		playRoomUntilReward(trace);
		const events = trace.find((list) =>
			list.some((e) => e.type === "RollResolved"),
		) as GameEvent[];
		const rolled = eventsOfType(events, "RollResolved")[0] as GameEvent;
		const afterwards = events.filter((e) => e.seq > rolled.seq);
		expect(afterwards.length).toBeGreaterThan(0);
		expect(events.filter((e) => e.seq < rolled.seq).map((e) => e.type)).not.toContain(
			"StatusChanged",
		);
		expect(lastEventOfType(events, "StatusChanged")?.seq).toBeGreaterThan(rolled.seq);
	});

	it("recordEvent aceita cause apontando para o seq de um evento anterior", () => {
		const s0 = recordEvent(base(), "RoomEntered", { roomId: "r" });
		const s1 = recordEvent(s0, "RoomWon", { roomId: "r" }, { cause: 0 });
		expect(gameOf(s1).events.map((e) => [e.seq, e.cause])).toEqual([
			[0, undefined],
			[1, 0],
		]);
	});

	it("GRANT_REWARDS emite RoomWon e RewardGranted de XP", () => {
		const s = reducer(testEngine, playRoomUntilReward(), { type: "GRANT_REWARDS" });
		expect(lastEventOfType(gameOf(s).events, "RoomWon")?.payload.roomId).toBe(
			room.cardId,
		);
		expect(lastEventOfType(gameOf(s).events, "RewardGranted")?.payload).toEqual({
			kind: "xp",
			amount: 2,
		});
	});

	it("recompensa de item descartada emite ItemDiscarded", () => {
		const s0 = base({
			status: "REWARD_PHASE",
			currentRoom: room,
			pendingRewards: [
				{ type: "item", cardId: "item_hunters_bow", requiresBearer: false },
			],
		});
		const s = reducer(testEngine, s0, {
			type: "CHOOSE_ITEM_DESTINATION",
			payload: { heroId: "h1", destination: "discard" },
		});
		expect(
			eventsOfType(gameOf(s).events, "ItemDiscarded").map((e) => e.payload),
		).toEqual([{ itemId: "item_hunters_bow" }]);
	});

	it("reduzir despertar emite DespertarChanged", () => {
		const s = lowerDespertar(testEngine, withAwakening(base(), 2));
		expect(lastEventOfType(gameOf(s).events, "DespertarChanged")?.payload).toEqual({
			from: 2,
			to: 1,
			cause: "lowered",
		});
	});

	it("eventLog textual continua sendo escrito em paralelo", () => {
		const s = lowerDespertar(testEngine, withAwakening(base(), 2));
		expect(gameOf(s).eventLog.length).toBeGreaterThan(0);
		const ev: GameEvent = { seq: gameOf(s).events.length, type: "RoomWon", payload: { roomId: "r" } };
		expect(gameOf(recordEvent(s, ev.type, { roomId: "r" })).events.at(-1)).toEqual(ev);
	});
});

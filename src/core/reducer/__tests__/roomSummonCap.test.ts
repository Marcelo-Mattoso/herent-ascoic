import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { cardById, cardsOfType, expansionOf } from "@/core/gameEngine";
import { deckOf, enemiesOf, withDeck } from "@/core/state/access";
import { createInitialGameState } from "@/core/state/gameState";
import { gameOf, withGame } from "@/engine/state";
import { buildDungeonRoomDeck, handleRevealRoom, handleSpawnEnemies } from "../exploration";
import { handleStartGame } from "../setup";

const HEROES = [
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_eternal_rest_cleric",
	"hero_rift_rogue",
] as const;

const EXPANSIONS = [
	{ id: "fornalha-sombria", bossId: "boss_azhakar" },
	{ id: "torre-grande-bruxa-caldeirao", bossId: "boss_great_cauldron_witch" },
] as const;

function start(bossId: string, players = 1, seed = 11) {
	const heroCardIds = HEROES.slice(0, players);
	return handleStartGame(testEngine, createInitialGameState({ heroCardIds }), {
		heroCardIds,
		bossCardId: bossId,
		difficulty: "normal",
		seed,
		deferInitialRoomReveal: true,
	});
}

function spawnRoom(roomId: string, bossId: string, players: number) {
	const roomCard = cardById(testEngine, roomId);
	if (!roomCard || roomCard.type !== "room") throw new Error("Sala inválida: " + roomId);
	const started = start(bossId, players);
	const ready = withGame(started, (game) => ({
		...game,
		roomsCleared: 4,
		status: "SPAWN_ENEMIES" as const,
		currentRoom: {
			cardId: roomId,
			exits: roomCard.exits,
			currentEnemies: roomCard.enemiesByPlayers[0],
			reward: roomCard.reward,
			rewardType: roomCard.rewardType,
			effect: "",
			xp: roomCard.xp ?? 0,
			...(roomCard.specialCreatureId ? { specialCreatureId: roomCard.specialCreatureId } : {}),
			status: "active" as const,
		},
	}));
	const before = deckOf(ready, "enemyDeck").available.length;
	const spawned = handleSpawnEnemies(testEngine, ready);
	return { roomCard, before, spawned, enemies: enemiesOf(spawned) };
}

describe("padrão de salas de masmorra das expansões", () => {
	it("mantém 0/1/2/3 XP nas dez salas comuns e duas salas de subchefe de 4 XP", () => {
		const patterns: string[] = [];
		for (const { id } of EXPANSIONS) {
			const rooms = cardsOfType(testEngine, "room")
				.filter((card) => expansionOf(testEngine, card.id) === id);
			const minibossRooms = cardsOfType(testEngine, "subboss_room")
				.filter((card) => expansionOf(testEngine, card.id) === id);
			expect(rooms).toHaveLength(10);
			expect(minibossRooms).toHaveLength(2);
			expect(rooms.map((card) => card.xp ?? 0).sort((a, b) => a - b))
				.toEqual([0, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
			expect(minibossRooms.map((card) => card.xp)).toEqual([4, 4]);
			expect(rooms.filter((card) => (card.xp ?? 0) === 0)[0]?.enemiesByPlayers)
				.toEqual([1, 1, 2, 2]);
			expect(rooms.filter((card) => (card.xp ?? 0) === 3)
				.every((card) => !card.specialCreatureId &&
					!card.skills.some((skill) => skill.skillId === "dungeon_skill_summon_guardian")))
				.toBe(true);
			patterns.push(JSON.stringify(rooms
				.map((card) => ({ xp: card.xp ?? 0, monsters: [...card.enemiesByPlayers] }))
				.sort((a, b) => a.xp - b.xp ||
					a.monsters.join(",").localeCompare(b.monsters.join(",")))));
		}
		expect(patterns[1]).toBe(patterns[0]);
	});

	it("monta o baralho com 2 cópias de cada sala comum e 1 de cada subchefe", () => {
		for (const { id } of EXPANSIONS) {
			const deck = buildDungeonRoomDeck(testEngine, id);
			expect(deck).toHaveLength(22);
			const counts = deck.reduce<Record<string, number>>((acc, roomId) => {
				acc[roomId] = (acc[roomId] ?? 0) + 1;
				return acc;
			}, {});
			const roomIds = cardsOfType(testEngine, "room")
				.filter((card) => expansionOf(testEngine, card.id) === id).map((card) => card.id);
			const subIds = cardsOfType(testEngine, "subboss_room")
				.filter((card) => expansionOf(testEngine, card.id) === id).map((card) => card.id);
			for (const roomId of roomIds) expect(counts[roomId]).toBe(2);
			for (const roomId of subIds) expect(counts[roomId]).toBe(1);
		}
	});

	it("a primeira sala é sempre a única sala de 0 XP, independente da seed", () => {
		for (const { id, bossId } of EXPANSIONS) {
			const firstCard = cardsOfType(testEngine, "room").find((card) =>
				expansionOf(testEngine, card.id) === id && (card.xp ?? 0) === 0);
			expect(firstCard).toBeDefined();
			for (const seed of [1, 2, 3, 5, 8, 13]) {
				const initial = start(bossId, 1, seed);
				const first = handleRevealRoom(testEngine, initial);
				expect(gameOf(first).currentRoom?.cardId).toBe(firstCard!.id);
				expect(gameOf(first).currentRoom?.xp).toBe(0);
			}
		}
	});

	it("as salas de 3 XP usam apenas criaturas comuns, com elites de 3 XP garantidas", () => {
		for (const { id, bossId } of EXPANSIONS) {
			const eliteRooms = cardsOfType(testEngine, "room").filter((card) =>
				expansionOf(testEngine, card.id) === id && (card.xp ?? 0) === 3);
			for (const room of eliteRooms) {
				for (const players of [1, 2, 3, 4]) {
					const { enemies } = spawnRoom(room.id, bossId, players);
					const expected = Math.min(4, room.enemiesByPlayers[players - 1]!);
					expect(enemies).toHaveLength(expected);
					const enemyCards = enemies.map((enemy) => cardById(testEngine, enemy.cardId));
					expect(enemyCards.every((card) => card?.type === "creature")).toBe(true);
					const eliteCount = enemyCards.filter((card) => card?.type === "creature" &&
						card.xp === 3).length;
					expect(eliteCount).toBeGreaterThanOrEqual(Math.min(expected, players === 1 ? 1 : 2));
				}
			}
		}
	});

	it("salas de 2 XP mantêm sua contagem sem subchefe automático", () => {
		for (const { id, bossId } of EXPANSIONS) {
			const room = cardsOfType(testEngine, "room").find((card) =>
				expansionOf(testEngine, card.id) === id && (card.xp ?? 0) === 2);
			expect(room).toBeDefined();
			const { enemies } = spawnRoom(room!.id, bossId, 2);
			expect(enemies).toHaveLength(room!.enemiesByPlayers[1]);
			expect(enemies.every((enemy) => cardById(testEngine, enemy.cardId)?.type === "creature"))
				.toBe(true);
		}
	});

	it("salas de 4 XP são acessíveis depois da quarta sala e convocam seu subchefe próprio", () => {
		for (const { id, bossId } of EXPANSIONS) {
			const subRooms = cardsOfType(testEngine, "subboss_room")
				.filter((card) => expansionOf(testEngine, card.id) === id);
			for (const room of subRooms) {
				const prepared = start(bossId);
				const forcedDeck = withDeck(prepared, "dungeonDeck", {
					...deckOf(prepared, "dungeonDeck"),
					available: [room.id],
					discarded: [],
					removed: [],
				});
				const atDepthFive = withGame(forcedDeck, (game) => ({
					...game, roomsCleared: 4, status: "REVEAL_ROOM" as const,
				}));
				const entered = handleRevealRoom(testEngine, atDepthFive);
				expect(gameOf(entered).currentRoom?.cardId).toBe(room.id);
				expect(enemiesOf(entered).map((enemy) => enemy.cardId)).toContain(room.linkedSubbossId);
				expect(gameOf(entered).currentRoom?.xp).toBe(4);
			}
		}
	});
});

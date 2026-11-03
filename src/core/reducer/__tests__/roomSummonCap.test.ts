import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { cardById } from "@/core/gameEngine";
import { deckOf, enemiesOf } from "@/core/state/access";
import { createInitialGameState } from "@/core/state/gameState";
import { gameOf, withGame } from "@/engine/state";
import { handleSpawnEnemies } from "../exploration";
import { handleStartGame } from "../setup";

const HEROES = [
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_eternal_rest_cleric",
	"hero_rift_rogue",
] as const;

function spawnRoom(roomId: string, players: number) {
	const heroCardIds = HEROES.slice(0, players);
	const initial = createInitialGameState({ heroCardIds });
	const started = handleStartGame(testEngine, initial, {
		heroCardIds,
		difficulty: "normal",
		seed: 11,
		deferInitialRoomReveal: true,
	});
	const roomCard = cardById(testEngine, roomId);
	if (!roomCard || roomCard.type !== "room") throw new Error("Sala inválida: " + roomId);
	const ready = withGame(started, (game) => ({
		...game,
		status: "SPAWN_ENEMIES",
		currentRoom: {
			cardId: roomId,
			exits: roomCard.exits,
			currentEnemies: roomCard.enemiesByPlayers[0],
			reward: roomCard.reward,
			rewardType: roomCard.rewardType,
			effect: "",
			xp: roomCard.xp ?? 0,
			...(roomCard.specialCreatureId ? { specialCreatureId: roomCard.specialCreatureId } : {}),
			status: "active",
		},
	}));
	const before = deckOf(ready, "enemyDeck").available.length;
	const spawned = handleSpawnEnemies(testEngine, ready);
	return { roomCard, before, spawned, enemies: enemiesOf(spawned) };
}

describe("limite de inimigos com invocação da sala", () => {
	it("com um herói a invocação ocupa a única vaga da sala Carcereiro", () => {
		const { roomCard, before, spawned, enemies } = spawnRoom("room_jailer_room", 1);
		expect(roomCard.type === "room" && roomCard.enemiesByPlayers[0]).toBe(1);
		expect(enemies).toHaveLength(1);
		expect(enemies[0]?.cardId).toBe("subboss_crimson_dungeon_jailer");
		expect(deckOf(spawned, "enemyDeck").available).toHaveLength(before);
		expect(gameOf(spawned).status).toBe("COMBAT_START");
	});

	it("com dois heróis a invocação conta como uma das duas criaturas", () => {
		const { roomCard, before, spawned, enemies } = spawnRoom("room_jailer_room", 2);
		expect(roomCard.type === "room" && roomCard.enemiesByPlayers[1]).toBe(2);
		expect(enemies).toHaveLength(2);
		expect(enemies.filter((enemy) => enemy.cardId === "subboss_crimson_dungeon_jailer")).toHaveLength(1);
		expect(deckOf(spawned, "enemyDeck").available).toHaveLength(before - 1);
	});

	it("com quatro heróis a invocação não cria um quinto inimigo na sala Carcereiro", () => {
		const { before, spawned, enemies } = spawnRoom("room_jailer_room", 4);
		expect(enemies).toHaveLength(4);
		expect(enemies.filter((enemy) => enemy.cardId === "subboss_crimson_dungeon_jailer")).toHaveLength(1);
		expect(deckOf(spawned, "enemyDeck").available).toHaveLength(before - 3);
	});

	it("a sala Abismo mantém seu limite próprio de cinco para quatro heróis, incluindo o Guardião", () => {
		const { roomCard, before, spawned, enemies } = spawnRoom("room_cracked_abyss", 4);
		expect(roomCard.type === "room" && roomCard.enemiesByPlayers[3]).toBe(5);
		expect(enemies).toHaveLength(5);
		expect(enemies.filter((enemy) => enemy.cardId === "subboss_cracked_abyss_guardian")).toHaveLength(1);
		expect(deckOf(spawned, "enemyDeck").available).toHaveLength(before - 4);
	});

	it("salas sem invocação mantêm a quantidade e a compra original", () => {
		const { before, spawned, enemies } = spawnRoom("room_dungeon_room", 2);
		expect(enemies).toHaveLength(2);
		expect(deckOf(spawned, "enemyDeck").available).toHaveLength(before - 2);
	});
});

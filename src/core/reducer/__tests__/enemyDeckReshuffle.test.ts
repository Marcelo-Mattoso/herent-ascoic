import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { cardById, cardsOfType, expansionOf } from "@/core/gameEngine";
import { deckOf, enemiesOf, withDeck } from "@/core/state/access";
import { createInitialGameState } from "@/core/state/gameState";
import { zoneViolation } from "@/core/state/zones";
import { gameOf, withGame } from "@/engine/state";
import { handleSpawnEnemies } from "../exploration";
import { handleStartGame } from "../setup";

const HEROES = [
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_eternal_rest_cleric",
	"hero_rift_rogue",
] as const;

function prepareEncounter(
	bossCardId: string,
	roomId: string,
	players: number,
	available: readonly string[],
) {
	const heroCardIds = HEROES.slice(0, players);
	const started = handleStartGame(
		testEngine,
		createInitialGameState({ heroCardIds, bossCardId }),
		{
			heroCardIds,
			bossCardId,
			seed: 41,
			difficulty: "normal",
			deferInitialRoomReveal: true,
		},
	);
	const roomCard = cardById(testEngine, roomId);
	if (!roomCard || roomCard.type !== "room") throw new Error("Sala inválida: " + roomId);
	const ready = withGame(started, (game) => ({
		...game,
		status: "SPAWN_ENEMIES" as const,
		// At the fifth room all creature tiers are unlocked; early rooms are intentionally restricted.
		roomsCleared: 4,
		currentRoom: {
			cardId: roomCard.id,
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
	return withDeck(ready, "enemyDeck", {
		...deckOf(ready, "enemyDeck"),
		available,
	});
}

function creaturePoolForBoss(bossCardId: string): string[] {
	const expansionId = expansionOf(testEngine, bossCardId);
	return cardsOfType(testEngine, "creature")
		.filter((card) => expansionOf(testEngine, card.id) === expansionId)
		.map((card) => card.id);
}

describe("reembaralhamento automático do baralho de criaturas", () => {
	it("quando vazio, reconstitui o deck de Azhakar e preenche a sala", () => {
		const bossId = "boss_azhakar";
		const state = prepareEncounter(bossId, "room_dungeon_room", 4, []);
		const room = cardById(testEngine, "room_dungeon_room");
		if (!room || room.type !== "room") throw new Error("Sala não encontrada");
		const count = Math.min(4, room.enemiesByPlayers[3]);
		const result = handleSpawnEnemies(testEngine, state);
		expect(enemiesOf(result)).toHaveLength(count);
		expect(gameOf(result).status).toBe("COMBAT_START");
		expect(deckOf(result, "enemyDeck").available).toHaveLength(creaturePoolForBoss(bossId).length - count);
		expect(gameOf(result).eventLog.some((entry) => entry.includes("Monstros da expansão reembaralhados"))).toBe(true);
		expect(zoneViolation(result.engine)).toBeNull();
	});

	it("na expansão da Bruxa, não mistura criaturas de outras expansões", () => {
		const bossId = "boss_great_cauldron_witch";
		const state = prepareEncounter(bossId, "room_rotting_inner_garden", 4, []);
		const result = handleSpawnEnemies(testEngine, state);
		const pool = creaturePoolForBoss(bossId);
		expect(enemiesOf(result)).toHaveLength(4);
		expect(pool).toHaveLength(18);
		expect(enemiesOf(result).every((enemy) => pool.includes(enemy.cardId))).toBe(true);
		expect(deckOf(result, "enemyDeck").available.every((id) => pool.includes(id))).toBe(true);
		expect(deckOf(result, "enemyDeck").available).toHaveLength(pool.length - 4);
		expect(zoneViolation(result.engine)).toBeNull();
	});

	it("usa a última carta disponível e completa a compra após reembaralhar", () => {
		const bossId = "boss_great_cauldron_witch";
		const lastCard = "creature_twisted_wood_wolf";
		const state = prepareEncounter(bossId, "room_rotting_inner_garden", 4, [lastCard]);
		const result = handleSpawnEnemies(testEngine, state);
		expect(enemiesOf(result)).toHaveLength(4);
		expect(enemiesOf(result)[0]?.cardId).toBe(lastCard);
		expect(deckOf(result, "enemyDeck").available).toHaveLength(creaturePoolForBoss(bossId).length - 3);
		expect(gameOf(result).status).toBe("COMBAT_START");
		expect(zoneViolation(result.engine)).toBeNull();
	});

	it("com a mesma seed, reembaralha na mesma ordem e consome o mesmo RNG", () => {
		const state = prepareEncounter("boss_great_cauldron_witch", "room_rotting_inner_garden", 4, []);
		const a = handleSpawnEnemies(testEngine, state);
		const b = handleSpawnEnemies(testEngine, state);
		expect(enemiesOf(a).map((enemy) => enemy.cardId)).toEqual(enemiesOf(b).map((enemy) => enemy.cardId));
		expect(deckOf(a, "enemyDeck")).toEqual(deckOf(b, "enemyDeck"));
		expect(gameOf(a).rng).toEqual(gameOf(b).rng);
	});

	it("invocação especial conta no limite e não consome o deck ao ser o único inimigo", () => {
		const state = prepareEncounter("boss_azhakar", "room_jailer_room", 1, []);
		const result = handleSpawnEnemies(testEngine, state);
		expect(enemiesOf(result)).toHaveLength(1);
		expect(enemiesOf(result)[0]?.cardId).toBe("subboss_crimson_dungeon_jailer");
		expect(deckOf(result, "enemyDeck").available).toHaveLength(0);
		expect(gameOf(result).eventLog.some((entry) => entry.includes("reembaralhados"))).toBe(false);
	});

	it("sala cadastrada com zero inimigos continua sem combate", () => {
		const state = prepareEncounter("boss_great_cauldron_witch", "room_old_vials_chamber", 1, []);
		const result = handleSpawnEnemies(testEngine, state);
		expect(gameOf(result).status).toBe("REWARD_PHASE");
		expect(enemiesOf(result)).toHaveLength(0);
		expect(deckOf(result, "enemyDeck").available).toHaveLength(0);
	});
});

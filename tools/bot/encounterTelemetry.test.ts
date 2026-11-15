import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { createInitialGameState } from "@/core/state/gameState";
import { withGame } from "@/engine/state";
import { recordRoomEncounterStep, type RoomEncounterTelemetry } from "./encounterTelemetry";

const makeRoom = (cardId: string, xp: number) => ({
	cardId, exits: 2, currentEnemies: 1, reward: 1, rewardType: "artifact" as const,
	effect: "", xp, status: "active" as const,
});
const makeEnemy = (id: string, cardId: string, status: "active" | "defeated" = "active") => ({
	id, cardId, status, firstDamageTakenThisTurn: false,
});

describe("telemetria de salas e elites", () => {
	it("conta visitas, criaturas de 3 XP e XP de sala sem inferir derrotas", () => {
		const sample: Record<string, RoomEncounterTelemetry> = {};
		const empty = createInitialGameState({ heroCardIds: [] });
		const first = withGame(empty, (game) => ({ ...game, roomsCleared: 4 }));
		const second = withGame(first, (game) => ({
			...game, currentRoom: makeRoom("room_jailer_room", 3),
			activeEnemies: [makeEnemy("e1", "creature_ruined_hall_ogre")],
		}));
		recordRoomEncounterStep(testEngine, first, second, sample);
		expect(sample.room_jailer_room).toMatchObject({
			entered: 1, cleared: 0, creaturesThreeXpSeen: 1, subbossesSeen: 0,
		});
		const cleared = withGame(second, (game) => ({
			...game, roomsCleared: 5, groupXp: 6,
			currentRoom: { ...game.currentRoom!, status: "cleared" as const },
			activeEnemies: [makeEnemy("e1", "creature_ruined_hall_ogre", "defeated")],
		}));
		recordRoomEncounterStep(testEngine, second, cleared, sample);
		expect(sample.room_jailer_room).toMatchObject({
			entered: 1, cleared: 1, xpAwardedOnClear: 6, roomCardXpOnClear: 3,
			subbossesDefeated: 0,
		});
	});

	it("conta subchefe visto e derrotado apenas na sala especial", () => {
		const sample: Record<string, RoomEncounterTelemetry> = {};
		const base = createInitialGameState({ heroCardIds: [] });
		const entered = withGame(base, (game) => ({
			...game, currentRoom: makeRoom("subboss_room_jailer_chamber", 4),
			activeEnemies: [makeEnemy("sb", "subboss_crimson_dungeon_jailer")],
		}));
		recordRoomEncounterStep(testEngine, base, entered, sample);
		expect(sample.subboss_room_jailer_chamber).toMatchObject({ entered: 1, subbossesSeen: 1, subbossesDefeated: 0 });
		const defeated = withGame(entered, (game) => ({
			...game, activeEnemies: [makeEnemy("sb", "subboss_crimson_dungeon_jailer", "defeated")],
		}));
		recordRoomEncounterStep(testEngine, entered, defeated, sample);
		expect(sample.subboss_room_jailer_chamber?.subbossesDefeated).toBe(1);
		recordRoomEncounterStep(testEngine, defeated, defeated, sample);
		expect(sample.subboss_room_jailer_chamber?.subbossesDefeated).toBe(1);
		// Morte que pula direto para o cemitério também precisa ser registrada.
		const direct = withGame(entered, (game) => ({
			...game, activeEnemies: [], enemyGraveyard: [
				makeEnemy("sb", "subboss_crimson_dungeon_jailer", "defeated"),
			],
		}));
		const fromDirect: Record<string, RoomEncounterTelemetry> = {};
		recordRoomEncounterStep(testEngine, entered, direct, fromDirect);
		expect(fromDirect.subboss_room_jailer_chamber?.subbossesDefeated).toBe(1);
	});
});

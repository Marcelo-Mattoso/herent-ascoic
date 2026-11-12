import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { cardsOfType } from "../gameEngine";
import { deckOf, enemiesOf, withDeck } from "../state/access";
import { createInitialGameState, type GameState } from "../state/gameState";
import { gameOf, withGame } from "../../engine/state";
import { handleSpawnEnemies } from "./exploration";
import { reducer } from "./index";

function started(): GameState {
	const heroCardIds = ["hero_crimson_barbarian"];
	return reducer(testEngine, createInitialGameState({ heroCardIds }), {
		type: "START_GAME",
		payload: { heroCardIds, seed: 7 },
	});
}

describe("fases que não podem travar", () => {
	it("sala sem nenhuma criatura elegível vai para a recompensa em vez de abrir combate vazio", () => {
		const state = started();
		const room = {
			...gameOf(state).currentRoom!,
			cardId: "room_dungeon_room",
			specialCreatureId: undefined,
		};
		const empty = withDeck(
			withGame(state, (game) => ({ ...game, currentRoom: room })),
			"enemyDeck",
			{ ...deckOf(state, "enemyDeck"), available: [], removed: cardsOfType(testEngine, "creature").map((card) => card.id) },
		);
		const next = handleSpawnEnemies(testEngine, empty);
		expect(gameOf(next).status).toBe("REWARD_PHASE");
		expect(enemiesOf(next)).toHaveLength(0);
	});

	it("GRANT_REWARDS em sala já paga avança sem repetir XP", () => {
		const state = started();
		const paid = withGame(state, (game) => ({
			...game,
			status: "REWARD_PHASE" as const,
			groupXp: 10,
			pendingRewards: [],
			currentRoom: { ...game.currentRoom!, status: "cleared" as const },
		}));
		const next = reducer(testEngine, paid, { type: "GRANT_REWARDS" });
		expect(gameOf(next).status).toBe("XP_SPEND_PHASE");
		expect(gameOf(next).groupXp).toBe(10);
	});

	it("comprar item com XP abre a recompensa", () => {
		const state = withGame(started(), (game) => ({
			...game,
			status: "XP_SPEND_PHASE" as const,
			groupXp: 15,
		}));
		const next = reducer(testEngine, state, {
			type: "SPEND_XP",
			payload: { option: "buy_item" },
		});
		expect(gameOf(next).status).toBe("REWARD_PHASE");
		expect(gameOf(next).groupXp).toBe(0);
		expect(gameOf(next).pendingRewards).toHaveLength(1);
	});
});

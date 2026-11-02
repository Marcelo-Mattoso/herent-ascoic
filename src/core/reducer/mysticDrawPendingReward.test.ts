import { describe, expect, it } from "vitest";
import { reducer } from "./index";
import { createInitialGameState } from "../state/gameState";
import { testEngine } from "@/core/__tests__/testEngine";
import { decksOf, withDecks, deckOf } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { gameOf, withGame } from "../../engine/state";

describe("Saque Místico pendente", () => {
	it("consome o item ainda na mesa e saca o artefato", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const started = reducer(testEngine, initial, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});
		const hero = gameOf(started).heroes[0];
		if (!hero) throw new Error("Herói de teste ausente.");
		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		const state = withDecks(withGame(started, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE" as const, pendingRewards: [
				{ type: "item" as const, cardId: itemId, requiresBearer: false },
			] })), {
				...decksOf(started),
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			});

		const result = reducer(testEngine, state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(gameOf(result).pendingRewards).toEqual([]);
		expect(deckOf(result, "itemDeck").removed).toContain(itemId);
		expect(gameOf(result).groupArtifacts).toContainEqual({
			cardId: artifactId,
			carriedBy: null,
		});
	});

	it("consome apenas a cópia equipada quando há outra recompensa igual na mesa", () => {
		const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const started = reducer(testEngine, initial, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});
		const hero = gameOf(started).heroes[0]!;
		const itemId = "item_ancient_iron_key";
		const state = settled(withGame(started, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE" as const, heroes: [{ ...hero, activeItems: { amulet: itemId } }], pendingRewards: [{ type: "item" as const, cardId: itemId, requiresBearer: false }] })));
		const result = reducer(testEngine, state, { type: "USE_ITEM", payload: { itemId, heroId: hero.id } });
		expect(gameOf(result).heroes[0]?.activeItems.amulet).toBeUndefined();
		expect(gameOf(result).pendingRewards).toEqual(gameOf(state).pendingRewards);
	});
});

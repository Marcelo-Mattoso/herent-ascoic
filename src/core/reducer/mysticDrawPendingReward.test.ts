import { describe, expect, it } from "vitest";
import { reducer } from "./index";
import { createInitialGameState } from "../state/gameState";

describe("Saque Místico pendente", () => {
	it("consome o item ainda na mesa e saca o artefato", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const started = reducer(initial, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});
		const hero = started.heroes[0];
		if (!hero) throw new Error("Herói de teste ausente.");
		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		const state = {
			...started,
			status: "REWARD_PHASE" as const,
			pendingRewards: [
				{ type: "item" as const, cardId: itemId, requiresBearer: false },
			],
			decks: {
				...started.decks,
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			},
		};

		const result = reducer(state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(result.pendingRewards).toEqual([]);
		expect(result.decks.itemDeck.removed).toContain(itemId);
		expect(result.groupArtifacts).toContainEqual({
			cardId: artifactId,
			carriedBy: null,
		});
	});
});

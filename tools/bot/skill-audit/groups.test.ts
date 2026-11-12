import { describe, expect, it } from "vitest";
import { getCardsByType } from "../../../src/core/data/cards";
import { cardAbilityGrants } from "../../../src/core/data/abilities";
import { createInitialGameState } from "../../../src/core/state/gameState";
import { reducer } from "../../../src/core/reducer";
import { playerView } from "../../../src/core/projection/playerView";
import { testEngine } from "../../../src/core/__tests__/testEngine";
import { heroesOf } from "../../../src/core/state/access";

/** Scenarios exercise the real reducer and player projection, not a mocked engine. */
function compositions(ids: readonly string[], partySize: number): string[][] {
	return ids.map((_, offset) =>
		Array.from({ length: partySize }, (_, index) => ids[(offset + index) % ids.length]!));
}

describe("skill audit: real-engine hero party smoke scenarios", () => {
	const heroIds = getCardsByType("hero").map((hero) => hero.id);
	for (const size of [1, 2, 3, 4]) {
		it(`initializes ${size}-hero groups and exposes their granted abilities`, () => {
			expect(heroIds.length).toBeGreaterThanOrEqual(size);
			for (const [index, selected] of compositions(heroIds, size).entries()) {
				const initial = createInitialGameState({ heroCardIds: selected });
				const state = reducer(testEngine, initial, {
					type: "START_GAME",
					payload: { heroCardIds: selected, seed: 900 + index + size * 100 },
				});
				const activeHeroes = heroesOf(state);
				expect(activeHeroes, `party ${selected.join(",")}`).toHaveLength(size);
				const view = playerView(testEngine, state);
				for (const hero of activeHeroes) {
					const grants = cardAbilityGrants(hero.cardId);
					const projected = view.abilityActionsByHero[hero.id] ?? [];
					for (const grant of grants) {
						if (grant.activation.kind === "manual" || grant.activation.kind === "event") {
							expect(projected.some((action) => action.abilityId === grant.abilityId),
								`${hero.cardId}/${grant.abilityId}`).toBe(true);
						}
					}
				}
			}
		});
	}
});

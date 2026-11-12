import { describe, expect, it } from "vitest";
import { playGame, setupFromSeed } from "../bot/play";
import { checkEcs, checkState, countCards } from "../bot/invariants";

// Historical golden actions were recorded before reactive dice decisions and
// balance changes. Current-state ECS coverage runs through the actual bot.
describe("ECS é a única fonte de vida e atributos em partidas do bot", () => {
	for (const seed of Array.from({ length: 40 }, (_, i) => i + 1)) {
		it(`seed ${seed}`, () => {
			const result = playGame(setupFromSeed(seed), 4000, (state, action) => {
				expect(checkEcs(state), `seed ${seed} ${action.type}`).toBeNull();
			});
			expect(checkState(result.final, countCards(result.final))?.invariant).not.toBe(
				"ecs_consistency",
			);
		});
	}
});

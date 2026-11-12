import { describe, expect, it } from "vitest";
import { legalActions } from "@/core/legalActions";
import { playGame, setupFromSeed } from "../bot/play";
import { applyAction, engine, initialState } from "./lib";

describe("legalActions do core × ações executadas pelo bot", () => {
	it("todas as ações escolhidas após START_GAME são legais no estado anterior", () => {
		let steps = 0;
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const result = playGame(setupFromSeed(seed), 3000);
			let state = initialState(result.setup);
			for (const [index, action] of result.actions.entries()) {
				if (index > 0) {
					expect(legalActions(engine, state), `seed ${seed} passo ${index}`).toContainEqual(action);
					steps++;
				}
				state = applyAction(state, action);
			}
		}
		expect(steps).toBeGreaterThan(100);
	});
});

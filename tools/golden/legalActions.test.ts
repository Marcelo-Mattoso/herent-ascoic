import { describe, expect, it } from "vitest";
import { legalActions } from "@/core/legalActions";
import { playGame, setupFromSeed } from "../bot/play";
import { applyAction, engine, initialState, startAction } from "./lib";

describe("legalActions do core × ações executadas pelo bot", () => {
	// Each seed is independently bounded. Seed 8 can take longer due to its
	// 400-step simulation and per-action legality checks; keep the same coverage.
	for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
		it(`seed ${seed}: cada ação escolhida era legal no estado anterior`, () => {
			const setup = setupFromSeed(seed);
			let state = applyAction(initialState(setup), startAction(setup));
			let steps = 0;
			playGame(setup, 400, (next, action) => {
				expect(legalActions(engine, state), `seed ${seed} passo ${steps + 1}`)
					.toContainEqual(action);
				state = next;
				steps++;
			});
			expect(steps).toBeGreaterThan(0);
		}, seed === 8 ? 30_000 : 15_000);
	}
});

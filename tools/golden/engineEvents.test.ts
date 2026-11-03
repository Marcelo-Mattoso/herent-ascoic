import { describe, expect, it } from "vitest";
import { playGame, setupFromSeed } from "../bot/play";
import { withAwakening } from "@/core/state/access";
import { createInitialGameState } from "@/core/state/gameState";
import { clearEvents } from "@/core/events/record";

describe("engine.events é só o log da action", () => {
	it("clearEvents zera os eventos da engine", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
			difficulty: "normal",
		});
		const dirty = withAwakening(base, 2);
		expect(dirty.engine.events.length).toBeGreaterThan(0);
		expect(clearEvents(dirty).engine.events).toEqual([]);
	});

	it("não cresce ao longo de uma partida", () => {
		let max = 0;
		playGame(setupFromSeed(3), 1500, (state) => {
			max = Math.max(max, state.engine.events.length);
		});
		expect(max).toBeLessThan(20);
	});
});

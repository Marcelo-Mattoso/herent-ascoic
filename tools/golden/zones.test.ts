import { describe, expect, it } from "vitest";
import type { GameState } from "@/core/state/gameState";
import { zoneViolation } from "@/core/state/zones";
import { playGame, setupFromSeed } from "../bot/play";
import { checkZones } from "../bot/invariants";

function assertZones(state: GameState, where: string): void {
	expect(zoneViolation(state.engine), where).toBeNull();
}

// Validate live legal flows, not actions persisted under obsolete combat rules.
describe("instâncias em exatamente uma zona em partidas do bot", () => {
	for (const seed of Array.from({ length: 30 }, (_, i) => i + 1)) {
		it(`seed ${seed}`, () => {
			const result = playGame(setupFromSeed(seed), 4000, (state, action) =>
				assertZones(state, `seed ${seed} ${action.type}`),
			);
			expect(checkZones(result.final)).toBeNull();
		});
	}
});

import { describe, expect, it, test } from "vitest";
import { playGame, replayGame, setupFromSeed } from "./play";
import { gameOf } from "@/engine/state";

const MAX_STEPS = 3000;

// Seeds com bugs reais do jogo, reproduzíveis com `npm run bot -- --seed N --games 1`.
const KNOWN_BUGS: Record<number, string> = {};

describe("bot headless", () => {
	it("deriva o mesmo setup da mesma seed", () => {
		expect(setupFromSeed(7)).toEqual(setupFromSeed(7));
	});

	it("joga 5 partidas sem violar invariantes", () => {
		const seeds = [1, 2, 3, 4, 5].filter((s) => !(s in KNOWN_BUGS));
		for (const seed of seeds) {
			const r = playGame(setupFromSeed(seed), MAX_STEPS);
			expect(r.violation, `seed ${seed}`).toBeNull();
		}
	});

	it("reexecuta um replay com o mesmo desfecho", () => {
		const seed = 1;
		const r = playGame(setupFromSeed(seed), MAX_STEPS);
		const again = replayGame({
			format: 1,
			seed,
			setup: r.setup,
			maxSteps: MAX_STEPS,
			actions: r.actions,
		});
		expect(again.violation).toEqual(r.violation);
		expect(gameOf(again.final).status).toBe(gameOf(r.final).status);
	});

	for (const [seed, reason] of Object.entries(KNOWN_BUGS)) {
		test.fails(`bug conhecido seed ${seed}: ${reason}`, () => {
			const r = playGame(setupFromSeed(Number(seed)), MAX_STEPS);
			expect(r.violation).toBeNull();
		});
	}
});

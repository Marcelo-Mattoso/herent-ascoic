import { describe, expect, it } from "vitest";
import { seededDice, shuffleWith } from "../../engine/dice";
import { createRng } from "../ports/random";
import { shuffleRng } from "../reducer/utils";

describe("embaralhamento do jogo × engine", () => {
	const seeds = [0, 1, 7, 19, 42, 1000, 123456, 2 ** 31 - 1, -5];
	const sizes = [0, 1, 2, 3, 5, 12, 40, 97];

	it("produz a mesma permutação e o mesmo consumo de RNG", () => {
		for (const seed of seeds) {
			for (const size of sizes) {
				const items = Array.from({ length: size }, (_, i) => `c${i}`);
				const game = shuffleRng(items, createRng(seed));
				const engine = shuffleWith(seededDice(seed), items);
				expect(engine.items).toEqual(game.value);
				expect(engine.next).toEqual({
					kind: "seeded",
					seed,
					counter: game.next.counter,
				});
			}
		}
	});

	it("parte de um contador já avançado e encadeia embaralhamentos", () => {
		const items = Array.from({ length: 20 }, (_, i) => `c${i}`);
		let rng = { seed: 9, counter: 33 };
		let dice = { ...seededDice(9), counter: 33 };
		for (let round = 0; round < 4; round++) {
			const game = shuffleRng(items, rng);
			const engine = shuffleWith(dice, items);
			expect(engine.items).toEqual(game.value);
			rng = game.next;
			dice = engine.next as typeof dice;
			expect(dice.counter).toBe(rng.counter);
		}
	});
});

import { describe, expect, it } from "vitest";
import { id, int, roll, seededDice } from "../../engine/dice";
import { rollDiceRng } from "../rules/dice";
import {
	createRng,
	nextFloat,
	nextId,
	nextInt,
	nextRoll,
	type RngState,
} from "./random";

// Implementação original do core, congelada como referência da equivalência.
function referenceFloat(rng: RngState) {
	let h = (rng.seed ^ rng.counter) | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	const value = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
	return { value, next: { seed: rng.seed, counter: rng.counter + 1 } };
}

function referenceInt(rng: RngState, max: number) {
	const { value, next } = referenceFloat(rng);
	return { value: Math.floor(value * max), next };
}

function referenceId(rng: RngState, prefix: string) {
	const a = referenceInt(rng, 0xffffffff);
	const b = referenceInt(a.next, 0xffffffff);
	return {
		value: `${prefix}-${a.value.toString(36)}-${b.value.toString(36)}`,
		next: b.next,
	};
}

const SEEDS = [0, 1, 2, 42, 1337, -1, -7, 123456789, 2 ** 31 - 1, 2 ** 32 - 1];
const COUNTERS = [0, 1, 2, 5, 63, 1000, 65535, 2 ** 20, 2 ** 31 - 1];
const states = SEEDS.flatMap((seed) =>
	COUNTERS.map((counter) => ({ seed, counter })),
);

describe("ports/random é um adaptador bit a bit da engine", () => {
	it("nextFloat é idêntico à referência", () => {
		for (const rng of states) {
			expect(nextFloat(rng)).toEqual(referenceFloat(rng));
		}
	});

	it("nextInt é idêntico à referência para vários máximos", () => {
		for (const rng of states) {
			for (const max of [1, 2, 3, 6, 10, 20, 100, 0xffffffff]) {
				expect(nextInt(rng, max)).toEqual(referenceInt(rng, max));
			}
		}
	});

	it("nextId é idêntico à referência e avança dois contadores", () => {
		for (const rng of states) {
			const got = nextId(rng, "h");
			expect(got).toEqual(referenceId(rng, "h"));
			expect(got.next.counter).toBe(rng.counter + 2);
		}
	});

	it("roll(seeded, n) == nextInt(rng, n).value + 1 e nextRoll coincide", () => {
		for (const rng of states) {
			for (const faces of [1, 2, 4, 6, 8, 12, 20]) {
				const dice = { ...seededDice(rng.seed), counter: rng.counter };
				const rolled = roll(dice, faces);
				expect(rolled.value).toBe(nextInt(rng, faces).value + 1);
				expect(rolled.next.counter).toBe(nextInt(rng, faces).next.counter);
				expect(nextRoll(rng, faces).value).toBe(rolled.value);
			}
		}
	});

	it("int e id da engine batem com o adaptador", () => {
		for (const rng of states) {
			const dice = { ...seededDice(rng.seed), counter: rng.counter };
			expect(int(dice, 17).value).toBe(nextInt(rng, 17).value);
			expect(id(dice, "e").value).toBe(nextId(rng, "e").value);
		}
	});

	it("rollDiceRng reproduz a rolagem de dados original em sequência", () => {
		for (const seed of SEEDS) {
			for (const faces of [6, 20]) {
				let reference = createRng(seed);
				const expected: number[] = [];
				for (let i = 0; i < 12; i++) {
					const r = referenceFloat(reference);
					reference = r.next;
					expected.push(Math.floor(r.value * faces) + 1);
				}
				const { result, next } = rollDiceRng(12, createRng(seed), faces);
				expect(result.results).toEqual(expected);
				expect(result.total).toBe(expected.reduce((a, b) => a + b, 0));
				expect(next).toEqual(reference);
			}
		}
	});
});

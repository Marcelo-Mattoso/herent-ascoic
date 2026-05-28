import { describe, expect, it } from "vitest";
import { createRng } from "../ports/random";
import { rollDiceRng } from "./dice";

describe("rollDiceRng", () => {
	it("retorna resultados determinísticos com a mesma seed", () => {
		const rng = createRng(42);
		const { result: r1 } = rollDiceRng(3, rng);
		const { result: r2 } = rollDiceRng(3, rng);
		// Mesma seed → mesmo resultado
		expect(r1.results).toEqual(r2.results);
		expect(r1.total).toBe(r2.total);
	});

	it("total é a soma dos resultados", () => {
		const { result } = rollDiceRng(4, createRng(1));
		expect(result.total).toBe(result.results.reduce((s, n) => s + n, 0));
	});

	it("rola 0 dados retornando array vazio e total 0", () => {
		const { result } = rollDiceRng(0, createRng(0));
		expect(result.results).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("respeita quantidade diferente de faces — resultado entre 1 e faces", () => {
		const { result } = rollDiceRng(10, createRng(99), 20);
		for (const v of result.results) {
			expect(v).toBeGreaterThanOrEqual(1);
			expect(v).toBeLessThanOrEqual(20);
		}
	});

	it("avança o RNG — seeds diferentes produzem resultados diferentes", () => {
		const { result: r1 } = rollDiceRng(3, createRng(1));
		const { result: r2 } = rollDiceRng(3, createRng(2));
		// Seeds diferentes quase certamente produzem ao menos um resultado diferente
		const same = r1.results.every((v, i) => v === r2.results[i]);
		expect(same).toBe(false);
	});

	it("next RNG avança monotonicamente — counter cresce", () => {
		const rng0 = createRng(7);
		const { next: rng1 } = rollDiceRng(1, rng0);
		const { next: rng2 } = rollDiceRng(1, rng1);
		expect(rng1.counter).toBeGreaterThan(rng0.counter);
		expect(rng2.counter).toBeGreaterThan(rng1.counter);
	});
});

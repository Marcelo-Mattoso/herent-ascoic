import { describe, expect, it } from "vitest";
import { rollDice } from "./dice";

describe("rollDice", () => {
	it("retorna resultados determinísticos com rng fixo", () => {
		// rng sempre retorna 0 → dado sempre cai em 1
		const result = rollDice(3, 6, () => 0);
		expect(result.results).toEqual([1, 1, 1]);
		expect(result.total).toBe(3);
	});

	it("rng retornando 0.999... → face máxima", () => {
		const result = rollDice(2, 6, () => 0.9999);
		expect(result.results).toEqual([6, 6]);
		expect(result.total).toBe(12);
	});

	it("total é a soma dos resultados", () => {
		let call = 0;
		// alterna entre 0 e 0.5 → faces 1 e 3
		const rng = () => (call++ % 2 === 0 ? 0 : 0.5);
		const result = rollDice(4, 6, rng);
		expect(result.total).toBe(result.results.reduce((s, n) => s + n, 0));
	});

	it("rola 0 dados retornando array vazio e total 0", () => {
		const result = rollDice(0, 6, () => 0);
		expect(result.results).toEqual([]);
		expect(result.total).toBe(0);
	});

	it("respeita quantidade diferente de faces", () => {
		// floor(0.5 * 20) + 1 = 11
		const result = rollDice(1, 20, () => 0.5);
		expect(result.results[0]).toBe(11);
	});
});

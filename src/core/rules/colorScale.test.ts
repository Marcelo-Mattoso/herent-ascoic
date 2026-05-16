import { describe, expect, it } from "vitest";
import { nextColor, previousColor, valueAtColor } from "./colorScale";

describe("nextColor", () => {
	it("avança do Branco para o Amarelo", () => {
		expect(nextColor(0)).toBe(1);
	});

	it("não passa do Roxo (índice 4)", () => {
		expect(nextColor(4)).toBe(4);
	});

	it("avança do Laranja para o Vermelho", () => {
		expect(nextColor(2)).toBe(3);
	});
});

describe("previousColor", () => {
	it("recua do Amarelo para o Branco", () => {
		expect(previousColor(1)).toBe(0);
	});

	it("não passa abaixo do Branco (índice 0)", () => {
		expect(previousColor(0)).toBe(0);
	});

	it("recua do Roxo para o Vermelho", () => {
		expect(previousColor(4)).toBe(3);
	});
});

describe("valueAtColor", () => {
	const values = [10, 20, 30, 40, 50] as const;

	it("lê o valor correto no índice 0 (Branco)", () => {
		expect(valueAtColor(values, 0)).toBe(10);
	});

	it("lê o valor correto no índice 4 (Roxo)", () => {
		expect(valueAtColor(values, 4)).toBe(50);
	});

	it("lê o valor correto no índice 2 (Laranja)", () => {
		expect(valueAtColor(values, 2)).toBe(30);
	});
});

import { describe, expect, it } from "vitest";
import { applyShield } from "./shield";

describe("applyShield", () => {
	it("sem escudo: dano passa intacto", () => {
		expect(applyShield(4, true, false)).toBe(4);
	});

	it("não é o primeiro dano do turno: escudo não ativa", () => {
		expect(applyShield(3, false, true)).toBe(3);
	});

	it("primeiro dano = 1, com escudo: reduzido a 0", () => {
		expect(applyShield(1, true, true)).toBe(0);
	});

	it("primeiro dano = 2, com escudo: reduzido a 0", () => {
		expect(applyShield(2, true, true)).toBe(0);
	});

	it("primeiro dano = 3, com escudo: reduzido em 2 (vira 1)", () => {
		expect(applyShield(3, true, true)).toBe(1);
	});

	it("primeiro dano = 5, com escudo: reduzido em 2 (vira 3)", () => {
		expect(applyShield(5, true, true)).toBe(3);
	});

	it("primeiro dano = 0, com escudo: continua 0", () => {
		expect(applyShield(0, true, true)).toBe(0);
	});
});

import { describe, expect, it } from "vitest";
import { isFleeAttemptWin } from "./flee";

describe("isFleeAttemptWin", () => {
	it("retorna true quando herói vence (total maior)", () => {
		expect(isFleeAttemptWin(7, 4)).toBe(true);
	});

	it("retorna false em empate", () => {
		expect(isFleeAttemptWin(5, 5)).toBe(false);
	});

	it("retorna false quando herói perde", () => {
		expect(isFleeAttemptWin(3, 6)).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { seededDice } from "./dice";
import { EMPTY_STACK, orderEntries, pushEntry } from "./stack";
import { createEngineState } from "./state";

describe("pilha da engine", () => {
	it("o estado novo nasce com pilha vazia", () => {
		const state = createEngineState({ dice: seededDice(1) });
		expect(state.stack).toEqual(EMPTY_STACK);
	});

	it("pushEntry numera por ordem de chegada e conta o que está resolvendo", () => {
		const first = pushEntry(EMPTY_STACK, { cause: "a", source: "x", effect: 1 });
		const second = pushEntry(first, { cause: "b", source: "x", effect: 2 });
		expect(second.pending.map((entry) => entry.id)).toEqual([
			"effect-0-a",
			"effect-1-b",
		]);
		const resolving = { ...second, resolving: second.pending[0] ?? null };
		expect(pushEntry(resolving, { cause: "c", source: "x", effect: 3 }).pending.at(-1)?.seq).toBe(3);
	});

	it("orderEntries aplica FIFO ou LIFO por seq sem alterar a entrada", () => {
		const stack = [1, 2, 3].reduce(
			(acc, n) => pushEntry(acc, { cause: "c", source: "s", effect: n }),
			EMPTY_STACK,
		);
		expect(orderEntries(stack.pending, "fifo").map((e) => e.effect)).toEqual([1, 2, 3]);
		expect(orderEntries(stack.pending, "lifo").map((e) => e.effect)).toEqual([3, 2, 1]);
		expect(stack.pending.map((e) => e.effect)).toEqual([1, 2, 3]);
	});
});

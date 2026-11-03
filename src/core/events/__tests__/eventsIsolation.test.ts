import { describe, expect, it } from "vitest";

const guarded = import.meta.glob<string>(
	[
		"../../reducer/**/*.ts",
		"../../rules/**/*.ts",
		"../../skills/**/*.ts",
		"!**/*.test.ts",
		"!**/__tests__/**",
	],
	{ query: "?raw", import: "default", eager: true },
);

const READS_EVENTS =
	/\.events\b|\{[^}]*\bevents\b[^}]*\}\s*=\s*\w*(?:state|next|prev)\b/;

function findEventReads(source: string): number[] {
	return source
		.split(/\r?\n/)
		.flatMap((line, i) =>
			READS_EVENTS.test(line.replace(/\/\/.*$/, "")) ? [i + 1] : [],
		);
}

describe("state.events é só o log da action", () => {
	it("a guarda enxerga os diretórios de reducer, rules e skills", () => {
		const dirs = new Set(
			Object.keys(guarded).map((file) => file.split("/")[2]),
		);
		expect(dirs).toEqual(new Set(["reducer", "rules", "skills"]));
	});

	it("reducer, rules e skills não leem state.events", () => {
		const violations = Object.entries(guarded).flatMap(([file, source]) =>
			findEventReads(source).map((line) => `${file}:${line}`),
		);
		expect(violations, violations.join("\n")).toEqual([]);
	});

	it("a guarda acusa leituras sintéticas e ignora escritas", () => {
		expect(findEventReads("const n = state.events.length;")).toEqual([1]);
		expect(findEventReads("a\nconst { events } = state;")).toEqual([2]);
		expect(findEventReads("return next.events.at(-1);")).toEqual([1]);
		expect(findEventReads("return { ...state, events: [] };")).toEqual([]);
		expect(findEventReads("// state.events nao conta")).toEqual([]);
	});
});

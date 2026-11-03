import { describe, expect, it } from "vitest";
import { modulesReachingCatalog, valueImports } from "./couplingGraph";

const exists = (rel: string) =>
	["src/core/a.ts", "src/core/b.ts", "src/core/sub/index.ts"].includes(rel);

describe("grafo de acoplamento", () => {
	it("import de valor entra; import type e export type ficam de fora", () => {
		const text = [
			'import { x } from "./a";',
			'import type { Y } from "./b";',
			'import { type Z, type W } from "./b";',
			'import { type Z, v } from "./sub";',
			'export type { T } from "./b";',
			'export {',
			"\ta,",
			'} from "./a";',
			'export * from "../data/cards";',
			'import "./efeito";',
			'const m = import("@/i18n");',
			'import raw from "../data/cards.yaml?raw";',
			'// import { c } from "./c";',
			'import pkg from "../../package.json";',
		].join("\n");
		expect(valueImports("src/core/x.ts", text, exists)).toEqual([
			"src/core/a.ts",
			"src/core/sub/index.ts",
			"src/core/a.ts",
			"src/data/cards",
			"src/core/efeito",
			"src/i18n",
			"src/data/cards.yaml",
			"package.json",
		]);
	});

	it("alcance transitivo ignora a raiz e trata ciclos", () => {
		const graph = new Map<string, string[]>([
			["src/core/ui.ts", ["src/core/skills.ts"]],
			["src/core/skills.ts", ["src/core/lookup.ts"]],
			["src/core/lookup.ts", ["src/core/data/skills.ts", "src/core/skills.ts"]],
			["src/core/data/skills.ts", ["src/data/skills.yaml"]],
			["src/core/puro.ts", ["src/core/outro.ts"]],
			["src/core/outro.ts", ["src/core/puro.ts"]],
		]);
		const reached = modulesReachingCatalog(
			graph,
			(m) => /^src\/core\/data\/skills\.ts$|^src\/data\//.test(m),
			(m) => m.startsWith("src/core/data/"),
		);
		expect(reached).toEqual([
			"src/core/lookup.ts",
			"src/core/skills.ts",
			"src/core/ui.ts",
		]);
	});
});

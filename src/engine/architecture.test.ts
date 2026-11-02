import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const engineDir = __dirname;

const forbiddenTerms = [
	"despertar",
	"impeto",
	"ímpeto",
	"dungeon",
	"room",
	"purple",
	"boss",
	"backpack",
	"artifact",
	"subboss",
	"hero",
	"monster",
	"xp",
	"reward",
	"skill",
	"exploration",
	"combat",
];
const forbiddenIdPrefix = /["'`](skill_|item_|hero_|power_|monster_)/;
const allowedBare = /^(zod|vitest)$|^node:/;

const IMPORT_SPEC =
	/^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/gm;

function wordsOf(text: string): string[] {
	return (text.match(/\p{L}[\p{L}\p{N}]*/gu) ?? []).flatMap((identifier) =>
		identifier
			.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
			.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
			.toLowerCase()
			.split(" "),
	);
}

function findTermViolations(source: string): string[] {
	const violations: string[] = [];
	source.split(/\r?\n/).forEach((line, i) => {
		const words = new Set(wordsOf(line));
		for (const term of forbiddenTerms) {
			if (words.has(term) || words.has(`${term}s`)) {
				violations.push(`${i + 1}: termo "${term}"`);
			}
		}
		const id = forbiddenIdPrefix.exec(line);
		if (id) violations.push(`${i + 1}: id com prefixo "${id[1]}"`);
	});
	return violations;
}

function findImportViolations(
	file: string,
	text: string,
	baseDir: string,
): string[] {
	const violations: string[] = [];
	for (const match of text.matchAll(IMPORT_SPEC)) {
		const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
		if (spec.startsWith(".")) {
			const target = path.resolve(path.dirname(file), spec);
			if (path.relative(baseDir, target).startsWith("..")) {
				violations.push(`import fora de src/engine "${spec}"`);
			}
		} else if (!allowedBare.test(spec)) {
			violations.push(`import não permitido "${spec}"`);
		}
	}
	return violations;
}

function listSources(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return listSources(full);
		return entry.name.endsWith(".ts") ? [full] : [];
	});
}

const sources = listSources(engineDir);
const self = path.join(engineDir, "architecture.test.ts");

function rel(file: string) {
	return path.relative(engineDir, file).split(path.sep).join("/");
}

describe("arquitetura de src/engine", () => {
	it("tem arquivos para verificar", () => {
		expect(sources.length).toBeGreaterThan(3);
	});

	it("nenhum import sai da pasta (exceto zod, vitest e node:)", () => {
		const violations = sources
			.filter((file) => file !== self)
			.flatMap((file) =>
				findImportViolations(
					file,
					fs.readFileSync(file, "utf8"),
					engineDir,
				).map((v) => `${rel(file)}: ${v}`),
			);
		expect(violations, violations.join("\n")).toEqual([]);
	});

	it("nenhum termo ou id do jogo em src/engine", () => {
		const violations = sources
			.filter((file) => file !== self)
			.flatMap((file) =>
				findTermViolations(fs.readFileSync(file, "utf8")).map(
					(v) => `${rel(file)}:${v}`,
				),
			);
		expect(violations, violations.join("\n")).toEqual([]);
	});
});

describe("a guarda acusa violações sintéticas", () => {
	it("termos por palavra, inclusive camelCase, snake_case e plural", () => {
		const casos: Array<[string, string]> = [
			["const heroId = 1;", "hero"],
			["const HeroState = {};", "hero"],
			["function gainXp() {}", "xp"],
			["// o monstro e o Monster", "monster"],
			["type RewardKind = string;", "reward"],
			["const total_rewards = 0;", "reward"],
			["export const skillOf = 1;", "skill"],
			["let EXPLORATION = 1;", "exploration"],
			["combat.start()", "combat"],
			["const Ímpeto = 2;", "ímpeto"],
			["const rooms = [];", "room"],
			['const x = "skill_basic";', "skill"],
		];
		for (const [source, termo] of casos) {
			const violations = findTermViolations(source);
			expect(
				violations.some((v) => v.includes(`"${termo}"`)),
				`${source} -> ${violations.join("|")}`,
			).toBe(true);
		}
		expect(findTermViolations('const x = "item_potion";')).toHaveLength(1);
	});

	it("não gera falso positivo por substring", () => {
		const limpo = [
			"const heroic = 1;",
			"const exports = []; // expected, sandbox, boxpad",
			"const taxpayer = 1; const chronological = 2;",
			"const zoomed = 1; const rewarding = 2;",
			"const skilled = 3; const bossa = 4; const doom = 5;",
			"const cardId = 1; const playerId = 2;",
		].join("\n");
		expect(findTermViolations(limpo)).toEqual([]);
	});

	it("imports: relativos que saem, pacotes externos e export from multilinha", () => {
		const file = path.join(engineDir, "x.ts");
		const casos = [
			'import { a } from "../core/x";',
			'import type { A } from "../../src/data/cards";',
			'export {\n\ta,\n\tb,\n} from "../core/y";',
			'export * from "../ui/z";',
			'import "../core/efeito";',
			'const m = await import("../core/dinamico");',
			'import fs from "fs";',
			'import r from "react";',
			'const q = require("lodash");',
		];
		for (const caso of casos) {
			expect(findImportViolations(file, caso, engineDir), caso).not.toEqual([]);
		}
		const ok = [
			'import { z } from "zod";',
			'import fs from "node:fs";',
			'export * from "./dice";',
			'export {\n\ta,\n} from "./events";',
		].join("\n");
		expect(findImportViolations(file, ok, engineDir)).toEqual([]);
	});
});

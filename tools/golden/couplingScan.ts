import fs from "node:fs";
import path from "node:path";
import { modulesReachingCatalog, valueImports } from "./couplingGraph";

const root = path.resolve(__dirname, "../..");
const coreDir = path.join(root, "src/core");

const ID_PATTERN = /["'`](?:skill|item|hero|power|monster|boss)_[a-z0-9_]+/g;
const ID_PREFIX = /["'`]((?:skill|item|hero|power|monster|boss)_)/;
export const TERMS = [
	"despertar",
	"impeto",
	"dungeon",
	"room",
	"purple",
	"boss",
	"backpack",
	"artifact",
	"subboss",
] as const;

// Único arquivo que pode importar catálogos, locales, defaults, JSON e package.json.
// Prefixos terminados em "/" cobrem pastas; os demais são arquivos.
const COMPOSITION_ROOTS: readonly string[] = ["src/core/composition.ts"];
// Loaders dos próprios catálogos: leem src/data e expõem os módulos que só o root consome.
const LOADERS: readonly string[] = ["src/core/data/", "src/core/config/"];
const CATALOG_MODULE =
	/^src\/core\/data\/(?:cards|skills|abilities|cardLocale|skillLocale)(?:\.tsx?)?$|^src\/core\/config\/defaults(?:\.tsx?)?$|^src\/data\/.*\.(?:ya?ml|json)$|^package\.json$/;

const matches = (list: readonly string[], rel: string) =>
	list.some((r) => (r.endsWith("/") ? rel.startsWith(r) : rel === r));
const isCompositionRoot = (rel: string) =>
	matches(COMPOSITION_ROOTS, rel) || matches(LOADERS, rel);

const exists = (rel: string) => {
	const full = path.join(root, rel);
	return fs.existsSync(full) && fs.statSync(full).isFile();
};

function walk(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
		if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
		return [full];
	});
}

function stripComment(line: string): string {
	const idx = line.indexOf("//");
	return idx >= 0 && !/["'`][^"'`]*\/\/[^"'`]*["'`]/.test(line)
		? line.slice(0, idx)
		: line;
}

type Hit = { readonly at: string; readonly text: string };

export function scanCoupling() {

	const literalIds: Hit[] = [];
	const termHits: Record<string, Hit[]> = Object.fromEntries(
		TERMS.map((t) => [t, []]),
	);
	const termRegexes = TERMS.map((t) => [t, new RegExp(t, "i")] as const);
	const IMPORT_LINE = /^\s*(?:import|export)\b[^=]*\bfrom\s*["']|^\s*import\s*["']/;

	const files = walk(coreDir).sort();
	const relOf = (file: string) =>
		path.relative(root, file).split(path.sep).join("/");
	const graph = new Map<string, string[]>();
	const catalogImports: Hit[] = [];

	for (const file of files) {
		const rel = relOf(file);
		const inRoot = isCompositionRoot(rel);
		const text = fs.readFileSync(file, "utf8");

		const imports = valueImports(rel, text, exists);
		graph.set(rel, imports);
		if (!inRoot) {
			for (const target of imports) {
				if (CATALOG_MODULE.test(target)) {
					catalogImports.push({ at: rel, text: target });
				}
			}
		}

		text.split(/\r?\n/).forEach((raw, i) => {
			const at = `${rel}:${i + 1}`;
			const trimmed = raw.trim();
			if (
				trimmed.startsWith("//") ||
				trimmed.startsWith("*") ||
				trimmed.startsWith("/*")
			) {
				return;
			}
			const line = stripComment(raw);
			if (IMPORT_LINE.test(line)) return;
			if (!inRoot) {
				for (const m of line.matchAll(ID_PATTERN)) {
					if (ID_PREFIX.test(m[0])) {
						literalIds.push({ at, text: m[0].slice(1) });
					}
				}
			}
			for (const [term, re] of termRegexes) {
				if (re.test(line)) {
					(termHits[term] as Hit[]).push({ at, text: trimmed.slice(0, 120) });
				}
			}
		});
	}

	const transitiveModules = modulesReachingCatalog(
		graph,
		(m) => CATALOG_MODULE.test(m),
		isCompositionRoot,
	);

	const idByPrefix: Record<string, number> = {};
	for (const h of literalIds) {
		const p = h.text.split("_")[0] as string;
		idByPrefix[p] = (idByPrefix[p] ?? 0) + 1;
	}

	const baseline = {
		scope: "src/core (exclui testes)",
		compositionRoots: COMPOSITION_ROOTS,
		loaders: LOADERS,
		filesScanned: files.length,
		totals: {
			literalContentIds: literalIds.length,
			catalogImportsOutsideCompositionRoot: catalogImports.length,
			transitiveCatalogReach: transitiveModules.length,
			gameTermLines: Object.values(termHits).reduce((n, h) => n + h.length, 0),
		},
		literalContentIds: {
			count: literalIds.length,
			byPrefix: idByPrefix,
			hits: literalIds,
		},
		gameTerms: Object.fromEntries(
			TERMS.map((t) => [
				t,
				{
					count: (termHits[t] as Hit[]).length,
					files: new Set((termHits[t] as Hit[]).map((h) => h.at.split(":")[0]))
						.size,
					hits: (termHits[t] as Hit[]).map((h) => h.at),
				},
			]),
		),
		catalogImports: {
			count: catalogImports.length,
			hits: catalogImports,
		},
		transitiveCatalogReach: {
			count: transitiveModules.length,
			modules: transitiveModules,
		},
	};


	return baseline;
}

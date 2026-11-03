import path from "node:path";

const IMPORT_STATEMENT =
	/^[ \t]*(import|export)\b(\s+type\b)?([^;'"]*?)\bfrom\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm;

export function stripComments(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
		.replace(/^[ \t]*\/\/.*$/gm, "");
}

function isTypeOnly(
	keyword: string,
	typeFlag: string | undefined,
	clause: string,
): boolean {
	if (typeFlag) return true;
	if (keyword === "export" && /^\s*\*/.test(clause)) return false;
	const named = /^\s*\{([^}]*)\}\s*$/.exec(clause);
	if (!named) return false;
	const specifiers = (named[1] as string)
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
	return (
		specifiers.length > 0 && specifiers.every((x) => x.startsWith("type "))
	);
}

export function resolveSpec(
	fromRel: string,
	spec: string,
	exists: (rel: string) => boolean,
): string | undefined {
	const clean = spec.replace(/\?.*$/, "");
	let base: string;
	if (clean.startsWith("@/")) base = `src/${clean.slice(2)}`;
	else if (clean.startsWith(".")) {
		base = path.posix.normalize(
			path.posix.join(path.posix.dirname(fromRel), clean),
		);
	} else if (clean === "package.json") return "package.json";
	else return undefined;
	return (
		[
			base,
			`${base}.ts`,
			`${base}.tsx`,
			`${base}/index.ts`,
			`${base}/index.tsx`,
		].find(exists) ?? base
	);
}

export function valueImports(
	fromRel: string,
	text: string,
	exists: (rel: string) => boolean,
): string[] {
	const out: string[] = [];
	for (const m of stripComments(text).matchAll(IMPORT_STATEMENT)) {
		const spec = m[4] ?? m[5] ?? m[6];
		if (!spec) continue;
		if (m[4] && isTypeOnly(m[1] as string, m[2], m[3] ?? "")) continue;
		const resolved = resolveSpec(fromRel, spec, exists);
		if (resolved) out.push(resolved);
	}
	return out;
}

export function modulesReachingCatalog(
	graph: ReadonlyMap<string, readonly string[]>,
	isCatalog: (module: string) => boolean,
	isRoot: (module: string) => boolean,
): string[] {
	const importedBy = new Map<string, string[]>();
	for (const [from, targets] of graph) {
		for (const to of targets) {
			importedBy.set(to, [...(importedBy.get(to) ?? []), from]);
		}
	}
	const targets = new Set<string>();
	for (const node of importedBy.keys()) if (isCatalog(node)) targets.add(node);
	for (const node of graph.keys()) if (isCatalog(node)) targets.add(node);
	const reached = new Set<string>();
	const queue = [...targets];
	while (queue.length > 0) {
		const node = queue.pop() as string;
		for (const parent of importedBy.get(node) ?? []) {
			if (reached.has(parent)) continue;
			if (isRoot(parent) && !targets.has(parent)) continue;
			reached.add(parent);
			queue.push(parent);
		}
	}
	return [...reached].filter((m) => !isRoot(m) && graph.has(m)).sort();
}

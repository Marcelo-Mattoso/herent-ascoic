import type { ScriptHandler } from "./types";

// Glob aponta para a pasta de entrada do designer.
// eager: true => tudo embutido no bundle, HMR gratuito no dev.
const modules = import.meta.glob<Record<string, ScriptHandler>>(
	"/src/data/scripts/*.ts",
	{ eager: true },
);

const cache = new Map<string, ScriptHandler>();
const warnedMissing = new Set<string>();

for (const [path, mod] of Object.entries(modules)) {
	const match = path.match(/scripts\/(.+)\.ts$/);
	if (!match?.[1]) continue;
	const cardKey = match[1];
	for (const [exportName, fn] of Object.entries(mod)) {
		if (typeof fn !== "function") continue;
		cache.set(`${cardKey}.${exportName}`, fn);
	}
}

export function getScript(ref: string): ScriptHandler | null {
	const fn = cache.get(ref);
	if (!fn) {
		if (!warnedMissing.has(ref)) {
			console.warn(`[SCRIPT NÃO ENCONTRADO: ${ref}]`);
			warnedMissing.add(ref);
		}
		return null;
	}
	return fn;
}

export function _resetForTests(): void {
	cache.clear();
	warnedMissing.clear();
}

export function _registerForTests(ref: string, fn: ScriptHandler): void {
	cache.set(ref, fn);
}

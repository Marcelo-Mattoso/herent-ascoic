import type { ScriptHandler, SkillContinuation } from "./types";

export const CONTINUATION_EXPORT = "continuation";

export interface ScriptRegistry {
	get(ref: string): ScriptHandler | null;
	continuationOf(skillId: string): SkillContinuation | null;
	register(ref: string, fn: ScriptHandler): void;
}

export function createScriptRegistry(
	modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ScriptRegistry {
	const cache = new Map<string, ScriptHandler>();
	const continuations = new Map<string, SkillContinuation>();
	const warnedMissing = new Set<string>();

	for (const [path, mod] of Object.entries(modules)) {
		const match = path.match(/scripts\/(.+)\.ts$/);
		if (!match?.[1]) continue;
		const cardKey = match[1];
		for (const [exportName, fn] of Object.entries(mod)) {
			if (typeof fn !== "function") continue;
			if (exportName === CONTINUATION_EXPORT) {
				continuations.set(cardKey, fn as SkillContinuation);
				continue;
			}
			cache.set(`${cardKey}.${exportName}`, fn as ScriptHandler);
		}
	}

	return {
		get(ref) {
			const fn = cache.get(ref);
			if (!fn) {
				if (!warnedMissing.has(ref)) {
					console.warn(`[SCRIPT NÃO ENCONTRADO: ${ref}]`);
					warnedMissing.add(ref);
				}
				return null;
			}
			return fn;
		},
		continuationOf: (skillId) => continuations.get(skillId) ?? null,
		register: (ref, fn) => {
			cache.set(ref, fn);
		},
	};
}

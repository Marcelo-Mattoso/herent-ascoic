export interface ScopeDef {
	readonly id: string;
	readonly within?: string;
}

export interface ScopeRegistry {
	readonly ids: () => readonly string[];
	readonly has: (scope: string) => boolean;
	readonly parentOf: (scope: string) => string | undefined;
	readonly isWithin: (scope: string, ancestor: string) => boolean;
	readonly assert: (scope: string) => string;
}

export const ENGINE_SCOPES: readonly ScopeDef[] = [
	{ id: "round" },
	{ id: "turn", within: "round" },
	{ id: "phase", within: "turn" },
];

export function createScopeRegistry(
	defs: readonly ScopeDef[] = ENGINE_SCOPES,
): ScopeRegistry {
	const parents = new Map<string, string | undefined>();
	for (const def of defs) {
		if (def.id === "" || def.id.includes(":")) {
			throw new Error(`Escopo inválido: "${def.id}"`);
		}
		if (parents.has(def.id)) {
			throw new Error(`Escopo duplicado: "${def.id}"`);
		}
		parents.set(def.id, def.within);
	}
	for (const [id, parent] of parents) {
		const seen = new Set([id]);
		for (let at = parent; at !== undefined; at = parents.get(at)) {
			if (!parents.has(at)) {
				throw new Error(
					`Escopo "${id}" está dentro de "${at}", não registrado`,
				);
			}
			if (seen.has(at)) throw new Error(`Escopos em ciclo: "${id}"`);
			seen.add(at);
		}
	}
	const has = (scope: string) => parents.has(scope);
	return {
		ids: () => [...parents.keys()],
		has,
		parentOf: (scope) => parents.get(scope),
		isWithin: (scope, ancestor) => {
			for (let at: string | undefined = scope; at !== undefined; ) {
				if (at === ancestor) return true;
				at = parents.get(at);
			}
			return false;
		},
		assert: (scope) => {
			if (!has(scope)) {
				throw new Error(
					`Escopo desconhecido: "${scope}". Registrados: ${[...parents.keys()].join(", ")}`,
				);
			}
			return scope;
		},
	};
}

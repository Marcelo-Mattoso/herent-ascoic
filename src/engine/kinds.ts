import type { ZodType, z } from "zod";

export interface KindNode {
	readonly kind: string;
	readonly [field: string]: unknown;
}

export type KindCategory = "effect" | "condition" | "ref";

export interface Choice {
	readonly id: string;
	readonly options: readonly string[];
	readonly player?: string;
	readonly min?: number;
	readonly max?: number;
	readonly data?: unknown;
}

export type Step<TState> =
	| { readonly state: TState }
	| { readonly state: TState; readonly pending: Choice }
	| { readonly state: TState; readonly push: readonly KindNode[] };

export interface RefUse {
	readonly space: string;
	readonly ref: string;
}

export interface DslKind<
	TState,
	TCtx,
	TNode extends KindNode = KindNode,
	TEval = TCtx,
	TDescriptor = TNode,
> {
	readonly kind: string;
	readonly schema: ZodType;
	readonly category: KindCategory;
	readonly aliases?: readonly string[];
	readonly vocabulary?: Readonly<Record<string, readonly string[]>>;
	readonly children?: (node: TNode) => readonly KindNode[];
	readonly refsOf?: (node: TNode) => readonly RefUse[];
	readonly targets?: (
		state: TState,
		node: TNode,
		ctx: TCtx,
	) => readonly string[];
	readonly evaluate?: (node: TNode, ctx: TEval) => TState;
	readonly test?: (node: TNode, ctx: TEval) => boolean;
	readonly resolve?: (
		state: TState,
		descriptor: TDescriptor,
		ctx: TCtx,
	) => Step<TState>;
}

export type ConditionResolver<
	TState,
	TCtx,
	TEval,
	TNode extends KindNode = KindNode,
> = DslKind<TState, TCtx, TNode, TEval> & {
	readonly category: "condition";
	readonly test: (node: TNode, ctx: TEval) => boolean;
};

export interface RefResolver<TEval> {
	readonly id: string;
	readonly space: string;
	readonly priority?: number;
	readonly resolve: (ref: string, ctx: TEval) => unknown;
}

export interface KindPackage<TState, TCtx, TEval = TCtx> {
	readonly id: string;
	readonly kinds: readonly DslKind<TState, TCtx, never, TEval, never>[];
	readonly refs?: readonly RefResolver<TEval>[];
}

export function defineKind<
	TState,
	TCtx,
	TSchema extends ZodType<KindNode>,
	TEval = TCtx,
	TDescriptor = z.output<TSchema>,
>(definition: {
	readonly kind: string;
	readonly category: KindCategory;
	readonly schema: TSchema;
	readonly aliases?: readonly string[];
	readonly vocabulary?: Readonly<Record<string, readonly string[]>>;
	readonly children?: (node: z.output<TSchema>) => readonly KindNode[];
	readonly refsOf?: (node: z.output<TSchema>) => readonly RefUse[];
	readonly evaluate?: (node: z.output<TSchema>, ctx: TEval) => TState;
	readonly test?: (node: z.output<TSchema>, ctx: TEval) => boolean;
	readonly resolve?: (
		state: TState,
		node: TDescriptor,
		ctx: TCtx,
	) => Step<TState>;
	readonly targets?: (
		state: TState,
		node: z.output<TSchema>,
		ctx: TCtx,
	) => readonly string[];
}): DslKind<TState, TCtx, z.output<TSchema>, TEval, TDescriptor> {
	return definition;
}

export function defineTypedKind<
	TNode extends KindNode,
	TState,
	TCtx,
	TEval = TCtx,
	TDescriptor = TNode,
>(
	definition: DslKind<TState, TCtx, TNode, TEval, TDescriptor>,
): DslKind<TState, TCtx, TNode, TEval, TDescriptor> {
	return definition;
}

export function defineCondition<
	TState,
	TCtx,
	TEval,
	TNode extends KindNode = KindNode,
>(definition: {
	readonly kind: string;
	readonly schema: ZodType;
	readonly children?: (node: TNode) => readonly KindNode[];
	readonly test: (node: TNode, ctx: TEval) => boolean;
}): ConditionResolver<TState, TCtx, TEval, TNode> {
	return { ...definition, category: "condition" };
}

export interface RunOutcome<TState> {
	readonly state: TState;
	readonly pending?: Choice;
	readonly stack: readonly KindNode[];
}

export interface KindRegistry<TState, TCtx, TEval = TCtx> {
	readonly kinds: () => readonly string[];
	readonly has: (kind: string) => boolean;
	readonly canResolve: (name: string) => boolean;
	readonly canEvaluate: (kind: string) => boolean;
	readonly categoryOf: (kind: string) => KindCategory | undefined;
	readonly vocabularyOf: (
		kind: string,
	) => Readonly<Record<string, readonly string[]>>;
	readonly parse: (node: KindNode) => KindNode;
	readonly parseAll: (nodes: readonly KindNode[]) => readonly KindNode[];
	readonly validate: (node: KindNode, origin?: string) => void;
	readonly validateAll: (nodes: readonly KindNode[], origin?: string) => void;
	readonly evaluate: (node: KindNode, ctx: TEval) => TState;
	readonly test: (node: KindNode, ctx: TEval) => boolean;
	readonly resolve: (
		state: TState,
		descriptor: KindNode,
		ctx: TCtx,
	) => Step<TState>;
	readonly ref: <TValue>(
		space: string,
		ref: string,
		ctx: TEval,
	) => TValue | undefined;
	readonly targets: (
		state: TState,
		node: KindNode,
		ctx: TCtx,
	) => readonly string[];
	readonly run: (
		state: TState,
		node: KindNode,
		ctx: TCtx,
	) => RunOutcome<TState>;
	readonly runAll: (
		state: TState,
		nodes: readonly KindNode[],
		ctx: TCtx,
	) => RunOutcome<TState>;
}

type AnyDefinition<TState, TCtx, TEval> = DslKind<
	TState,
	TCtx,
	never,
	TEval,
	never
>;

const MAX_STEPS = 100_000;

export function createKindRegistry<TState, TCtx, TEval = TCtx>(
	definitions: readonly AnyDefinition<TState, TCtx, TEval>[],
	options: { readonly refs?: readonly RefResolver<TEval>[] } = {},
): KindRegistry<TState, TCtx, TEval> {
	const table = new Map<string, AnyDefinition<TState, TCtx, TEval>>();
	const byName = new Map<string, AnyDefinition<TState, TCtx, TEval>>();
	for (const definition of definitions) {
		if (table.has(definition.kind)) {
			throw new Error(`Kind duplicado no registro: "${definition.kind}"`);
		}
		table.set(definition.kind, definition);
	}
	for (const definition of definitions) {
		for (const name of [definition.kind, ...(definition.aliases ?? [])]) {
			const owner = byName.get(name);
			if (owner !== undefined && owner !== definition) {
				throw new Error(
					`Nome "${name}" já pertence ao kind "${owner.kind}" (alias de "${definition.kind}")`,
				);
			}
			byName.set(name, definition);
		}
	}

	const refs = [...(options.refs ?? [])].sort(
		(a, b) => (a.priority ?? 0) - (b.priority ?? 0),
	);
	const refIds = new Set<string>();
	for (const resolver of refs) {
		if (refIds.has(resolver.id)) {
			throw new Error(`RefResolver duplicado no registro: "${resolver.id}"`);
		}
		refIds.add(resolver.id);
	}

	const resolveRef = (space: string, ref: string, ctx: TEval) => {
		for (const resolver of refs) {
			if (resolver.space !== space) continue;
			const value = resolver.resolve(ref, ctx);
			if (value !== undefined) return value;
		}
		return undefined;
	};

	const registered = () => [...table.keys()].join(", ") || "(nenhum)";

	const lookup = (kind: string) => {
		const definition = table.get(kind);
		if (!definition) {
			throw new Error(
				`Kind desconhecido: "${kind}". Registrados: ${registered()}`,
			);
		}
		return definition;
	};

	const parse = (node: KindNode): KindNode => {
		const parsed = lookup(node.kind).schema.safeParse(node);
		if (!parsed.success) {
			throw new Error(`Kind "${node.kind}" inválido: ${parsed.error.message}`);
		}
		return parsed.data as KindNode;
	};

	const validate = (node: KindNode, origin = "conteúdo"): void => {
		const kind = (node as { kind?: unknown }).kind;
		if (typeof kind !== "string") {
			throw new Error(`${origin}: nó sem "kind" textual`);
		}
		const definition = table.get(kind);
		if (!definition) {
			throw new Error(
				`${origin}: kind "${kind}" sem implementação registrada. Registrados: ${registered()}`,
			);
		}
		const parsed = definition.schema.safeParse(node);
		if (!parsed.success) {
			throw new Error(
				`${origin}: kind "${kind}" inválido: ${parsed.error.message}`,
			);
		}
		for (const use of definition.refsOf?.(parsed.data as never) ?? []) {
			if (resolveRef(use.space, use.ref, undefined as never) === undefined) {
				throw new Error(
					`${origin}: kind "${kind}" usa ${use.space} "${use.ref}" sem resolvedor registrado`,
				);
			}
		}
		const children = definition.children?.(parsed.data as never) ?? [];
		children.forEach((child, index) => {
			validate(child, `${origin} > ${kind}[${index}]`);
		});
	};

	const resolveNamed = (
		state: TState,
		descriptor: KindNode,
		ctx: TCtx,
	): Step<TState> => {
		const definition = byName.get(descriptor.kind);
		if (!definition) {
			throw new Error(
				`Kind desconhecido: "${descriptor.kind}". Registrados: ${registered()}`,
			);
		}
		if (!definition.resolve) {
			throw new Error(`Kind "${definition.kind}" não tem resolve`);
		}
		return definition.resolve(state, descriptor as never, ctx);
	};

	const runAll = (
		initial: TState,
		nodes: readonly KindNode[],
		ctx: TCtx,
	): RunOutcome<TState> => {
		let state = initial;
		let stack = [...nodes];
		for (let steps = 0; stack.length > 0; steps++) {
			if (steps >= MAX_STEPS) {
				throw new Error(`Pilha de kinds excedeu ${MAX_STEPS} passos`);
			}
			const [node, ...rest] = stack;
			const step = resolveNamed(state, node, ctx);
			state = step.state;
			if ("pending" in step)
				return { state, pending: step.pending, stack: rest };
			stack = "push" in step ? [...step.push, ...rest] : rest;
		}
		return { state, stack };
	};

	return {
		kinds: () => [...table.keys()],
		has: (kind) => table.has(kind),
		canResolve: (name) => byName.get(name)?.resolve !== undefined,
		canEvaluate: (kind) => table.get(kind)?.evaluate !== undefined,
		categoryOf: (kind) => table.get(kind)?.category,
		vocabularyOf: (kind) => table.get(kind)?.vocabulary ?? {},
		parse,
		parseAll: (nodes) => nodes.map(parse),
		validate,
		validateAll: (nodes, origin) => {
			for (const node of nodes) validate(node, origin);
		},
		evaluate: (node, ctx) => {
			const definition = lookup(node.kind);
			if (!definition.evaluate) {
				throw new Error(`Kind "${node.kind}" não tem evaluate`);
			}
			return definition.evaluate(node as never, ctx);
		},
		test: (node, ctx) => {
			const definition = lookup(node.kind);
			if (!definition.test) {
				throw new Error(`Kind "${node.kind}" não é uma condição`);
			}
			return definition.test(node as never, ctx);
		},
		resolve: resolveNamed,
		ref: <TValue>(space: string, ref: string, ctx: TEval) =>
			resolveRef(space, ref, ctx) as TValue | undefined,
		targets: (state, node, ctx) =>
			lookup(node.kind).targets?.(state, node as never, ctx) ?? [],
		run: (state, node, ctx) => runAll(state, [node], ctx),
		runAll,
	};
}

export function createKindRegistryFrom<TState, TCtx, TEval = TCtx>(
	...packages: readonly KindPackage<TState, TCtx, TEval>[]
): KindRegistry<TState, TCtx, TEval> {
	return createKindRegistry(
		packages.flatMap((pkg) => pkg.kinds),
		{ refs: packages.flatMap((pkg) => pkg.refs ?? []) },
	);
}

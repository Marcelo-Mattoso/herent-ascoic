export interface StackEntry<TEffect = unknown> {
	readonly id: string;
	readonly seq: number;
	readonly cause: string;
	readonly source: string;
	readonly effect: TEffect;
}

export interface EngineStack<TEffect = unknown> {
	readonly pending: readonly StackEntry<TEffect>[];
	readonly resolving: StackEntry<TEffect> | null;
}

export type StackOrder = "fifo" | "lifo";

export const EMPTY_STACK: EngineStack = { pending: [], resolving: null };

export function pushEntry<TEffect>(
	stack: EngineStack<TEffect>,
	entry: Omit<StackEntry<TEffect>, "id" | "seq">,
): EngineStack<TEffect> {
	const seq = stack.pending.length + (stack.resolving ? 1 : 0);
	const id = `effect-${seq}-${entry.cause}`;
	return { ...stack, pending: [...stack.pending, { ...entry, id, seq }] };
}

export function orderEntries<TEffect>(
	pending: readonly StackEntry<TEffect>[],
	order: StackOrder,
): readonly StackEntry<TEffect>[] {
	const sorted = [...pending].sort((a, b) => a.seq - b.seq);
	return order === "lifo" ? sorted.reverse() : sorted;
}

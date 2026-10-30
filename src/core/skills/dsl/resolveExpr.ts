// Resolução de ExprNode → number | string.
// Pura — sem efeitos colaterais.

import type { ArithExpr, EvalCtx, ExprNode } from "./types";

/** Sentinela: ExprNode resolveu para null (array-por-cor em despertar sem efeito). */
export class SkipEffect extends Error {
	constructor() {
		super("SkipEffect");
		this.name = "SkipEffect";
	}
}

/**
 * Resolve um ExprNode para número.
 * Throws SkipEffect se o nó for array-por-cor com null na posição do despertar atual.
 * Throws Error se a ref não resolver para número.
 */
export function resolveExpr(node: ExprNode, ctx: EvalCtx): number {
	if (typeof node === "number") return node;

	if (typeof node === "string") {
		return resolveRef(node, ctx);
	}

	// Tupla indexada pelo contador de progressão que o jogo registra no espaço "index"
	if (Array.isArray(node)) {
		const idx = ctx.engine.kinds.ref<number>("index", "tuple", ctx);
		if (idx === undefined) throw new Error("[resolveExpr] espaço index sem resolvedor");
		const v = (node as ReadonlyArray<number | null>)[idx];
		if (v === null) throw new SkipEffect();
		return v;
	}

	// ArithExpr
	const expr = node as ArithExpr;
	const [a, b] = expr.args;
	const left = resolveExpr(a, ctx);
	const right = resolveExpr(b, ctx);
	switch (expr.op) {
		case "add":
			return left + right;
		case "sub":
			return left - right;
		case "mul":
			return left * right;
		case "div":
			return right !== 0 ? left / right : 0;
		case "min":
			return Math.min(left, right);
		case "max":
			return Math.max(left, right);
	}
	return 0;
}

/**
 * Resolve uma ref simbólica para número pelos RefResolver registrados na engine.
 */
function resolveRef(ref: string, ctx: EvalCtx): number {
	if (!ref.startsWith("$")) {
		// Literal não prefixado — tenta converter
		const n = Number(ref);
		if (!Number.isNaN(n)) return n;
		throw new Error(
			`[resolveExpr] ref "${ref}" não começa com $ e não é número`,
		);
	}

	const value = ctx.engine.kinds.ref<number>("number", ref, ctx);
	if (value !== undefined) return value;

	throw new Error(`[resolveExpr] ref desconhecida: "${ref}"`);
}

/**
 * Resolve uma ref simbólica para entityId (string).
 * Usado por effects que precisam de um alvo, não de um número.
 */
export function resolveEntityRef(ref: string, ctx: EvalCtx): string | null {
	if (!ref.startsWith("$")) return ref; // id literal
	return ctx.engine.kinds.ref<string | null>("entity", ref, ctx) ?? null;
}

/**
 * Resolve uma ref para lista de entity ids.
 */
export function resolveEntityListRef(
	ref: string,
	ctx: EvalCtx,
): readonly string[] {
	const list = ctx.engine.kinds.ref<readonly string[]>("entities", ref, ctx);
	if (list !== undefined) return list;

	const single = resolveEntityRef(ref, ctx);
	return single ? [single] : [];
}

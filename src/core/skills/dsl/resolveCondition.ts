// Resolução de ConditionNode → boolean, despachada para o ConditionResolver
// registrado na engine. Pura — sem efeitos colaterais.
// Serve duas posições: nó `if` dentro de `effect` e campo `when` do trigger.

import { asKindNode } from "./kinds/shared";
import { resolveExpr } from "./resolveExpr";
import type { ConditionNode, EvalCtx, ExprNode } from "./types";

export function resolveCondition(node: ConditionNode, ctx: EvalCtx): boolean {
	const kindNode = asKindNode(node);
	if (ctx.engine.kinds.categoryOf(kindNode.kind) !== "condition") {
		throw new Error(
			`Condição "${kindNode.kind}" sem implementação registrada (habilidade "${ctx.skillId}")`,
		);
	}
	return ctx.engine.kinds.test(kindNode, ctx);
}

/**
 * Resolve ExprNode para valor comparável (number | string | unknown[]).
 * Para `compare`, `right` pode ser um array JSON quando `op === "in"`.
 */
export function resolveValue(node: ExprNode, ctx: EvalCtx): unknown {
	if (typeof node === "number") return node;

	if (typeof node === "string") {
		if (!node.startsWith("$")) {
			// Tenta número, depois string literal
			const n = Number(node);
			return Number.isNaN(n) ? node : n;
		}

		const name = node.slice(1);

		// Params podem ser array (para `in`)
		if (name in ctx.params) return ctx.params[name];

		// Fallback numérico (throws internamente se falhar)
		try {
			return resolveExpr(node, ctx);
		} catch {
			return null;
		}
	}

	// ArithExpr — sempre numérico
	return resolveExpr(node, ctx);
}

// Resolução de ConditionNode → boolean.
// Pura — sem efeitos colaterais.
// Serve duas posições: nó `if` dentro de `effect` e campo `when` do trigger.

import { resolveEntityRef, resolveExpr } from "./resolveExpr";
import type { ConditionNode, EvalCtx } from "./types";

export function resolveCondition(node: ConditionNode, ctx: EvalCtx): boolean {
	switch (node.kind) {
		case "has_skill": {
			const entityId = resolveEntityRef(node.of, ctx);
			if (!entityId) return false;
			return ctx.query.creatureHasSkill(entityId, node.skillId);
		}

		case "has_condition": {
			const entityId = resolveEntityRef(node.of, ctx);
			if (!entityId) return false;
			// Verificar nas conditions do herói ou inimigo
			const hero = ctx.state.heroes.find((h) => h.id === entityId);
			if (hero) return hero.conditions.includes(node.conditionType);
			const enemy = ctx.state.activeEnemies.find((e) => e.id === entityId);
			if (enemy) return enemy.conditions.includes(node.conditionType);
			return false;
		}

		case "compare": {
			const left = resolveValue(node.left, ctx);
			const right = resolveValue(node.right, ctx);

			if (node.op === "in") {
				if (Array.isArray(right)) return right.includes(left);
				return left === right;
			}

			// Comparação numérica/string
			const l = left as number | string;
			const r = right as number | string;
			switch (node.op) {
				case "lt":
					return l < r;
				case "lte":
					return l <= r;
				case "eq":
					return l === r;
				case "gte":
					return l >= r;
				case "gt":
					return l > r;
			}
		}

		case "and":
			return node.children.every((c) => resolveCondition(c, ctx));

		case "or":
			return node.children.some((c) => resolveCondition(c, ctx));

		case "not":
			return !resolveCondition(node.child, ctx);
	}
}

/**
 * Resolve ExprNode para valor comparável (number | string | unknown[]).
 * Para `compare`, `right` pode ser um array JSON quando `op === "in"`.
 */
function resolveValue(node: import("./types").ExprNode, ctx: EvalCtx): unknown {
	if (typeof node === "number") return node;

	if (typeof node === "string") {
		if (!node.startsWith("$")) {
			// Tenta número, depois string literal
			const n = Number(node);
			return Number.isNaN(n) ? node : n;
		}

		const name = node.slice(1);

		// Refs especiais de estado que retornam string (não número)
		switch (name) {
			case "dungeon.level":
				return ctx.query.dungeonLevel();
			case "room.enemy_count":
				return ctx.query.roomEnemyCount();
		}

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

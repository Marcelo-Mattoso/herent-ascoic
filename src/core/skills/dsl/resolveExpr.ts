// Resolução de ExprNode → number | string.
// Pura — sem efeitos colaterais.

import type { EvalCtx, ExprNode } from "./types";

/**
 * Resolve um ExprNode para número.
 * Throws se a ref não resolver para número.
 */
export function resolveExpr(node: ExprNode, ctx: EvalCtx): number {
	if (typeof node === "number") return node;

	if (typeof node === "string") {
		return resolveRef(node, ctx);
	}

	// ArithExpr
	const [a, b] = node.args;
	const left = resolveExpr(a, ctx);
	const right = resolveExpr(b, ctx);
	switch (node.op) {
		case "add": return left + right;
		case "sub": return left - right;
		case "mul": return left * right;
		case "div": return right !== 0 ? left / right : 0;
		case "min": return Math.min(left, right);
		case "max": return Math.max(left, right);
	}
}

/**
 * Resolve uma ref simbólica para número.
 * Tenta ctx.params primeiro, depois refs especiais de estado.
 */
function resolveRef(ref: string, ctx: EvalCtx): number {
	if (!ref.startsWith("$")) {
		// Literal não prefixado — tenta converter
		const n = Number(ref);
		if (!Number.isNaN(n)) return n;
		throw new Error(`[resolveExpr] ref "${ref}" não começa com $ e não é número`);
	}

	const name = ref.slice(1); // remove "$"

	// Params da habilidade
	if (name in ctx.params) {
		const v = ctx.params[name];
		if (typeof v === "number") return v;
		const n = Number(v);
		if (!Number.isNaN(n)) return n;
		throw new Error(`[resolveExpr] param "${name}" não é número: ${String(v)}`);
	}

	// Refs especiais de estado
	switch (name) {
		case "dungeon.level": return ctx.query.dungeonLevel();
		case "room.enemy_count": return ctx.query.roomEnemyCount();
		case "self.currentLife":
		case "self.maxLife": {
			const entityId = ctx.sourceId;
			if (!entityId) throw new Error(`[resolveExpr] $${name} requer sourceId`);
			const hero = ctx.state.heroes.find((h) => h.id === entityId);
			if (hero) return name === "self.currentLife" ? hero.currentLife : hero.maxLife;
			const enemy = ctx.state.activeEnemies.find((e) => e.id === entityId);
			if (enemy) return name === "self.currentLife" ? enemy.currentLife : enemy.maxLife;
			throw new Error(`[resolveExpr] entidade "${entityId}" não encontrada para $${name}`);
		}
	}

	// Refs de entidade compostas ("source.currentLife" etc.) — extensível sob demanda
	if (name.includes(".")) {
		const [entity, prop] = name.split(".", 2) as [string, string];
		const entityId = resolveEntityRef(`$${entity}`, ctx);
		if (entityId) {
			const hero = ctx.state.heroes.find((h) => h.id === entityId);
			if (hero && prop === "currentLife") return hero.currentLife;
			if (hero && prop === "maxLife") return hero.maxLife;
			const enemy = ctx.state.activeEnemies.find((e) => e.id === entityId);
			if (enemy && prop === "currentLife") return enemy.currentLife;
			if (enemy && prop === "maxLife") return enemy.maxLife;
		}
	}

	throw new Error(`[resolveExpr] ref desconhecida: "${ref}"`);
}

/**
 * Resolve uma ref simbólica para entityId (string).
 * Usado por effects que precisam de um alvo, não de um número.
 */
export function resolveEntityRef(ref: string, ctx: EvalCtx): string | null {
	if (!ref.startsWith("$")) return ref; // id literal

	switch (ref) {
		case "$source": return ctx.sourceId;
		case "$target": return ctx.targetId;
		case "$self": return ctx.sourceId;
	}

	// Ref a param
	const name = ref.slice(1);
	if (name in ctx.params) {
		const v = ctx.params[name];
		return typeof v === "string" ? v : null;
	}

	return null;
}

/**
 * Resolve uma ref para lista de entity ids.
 */
export function resolveEntityListRef(ref: string, ctx: EvalCtx): readonly string[] {
	switch (ref) {
		case "$targets": return ctx.targetIds;
		case "$source": return ctx.sourceId ? [ctx.sourceId] : [];
		case "$target": return ctx.targetId ? [ctx.targetId] : [];
		case "all_heroes":
			return ctx.state.heroes.filter((h) => h.status === "active").map((h) => h.id);
		case "all_enemies":
			return ctx.state.activeEnemies.filter((e) => e.status === "active").map((e) => e.id);
	}

	const single = resolveEntityRef(ref, ctx);
	return single ? [single] : [];
}

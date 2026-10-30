// Evaluator da DSL de efeitos: despacha cada nó para o kind registrado na engine.

import type { GameState } from "../../state/gameState";
import { SkipEffect } from "./resolveExpr";
import type { EffectNode, EvalCtx } from "./types";

export function evaluate(
	effects: readonly EffectNode[],
	ctx: EvalCtx,
): GameState {
	let cur = ctx;
	for (const node of effects) {
		try {
			const next = evaluateOne(node, cur);
			cur = cur.withState(next);
		} catch (e) {
			if (e instanceof SkipEffect) continue;
			throw e;
		}
	}
	return cur.state;
}

function evaluateOne(node: EffectNode, ctx: EvalCtx): GameState {
	if (!ctx.engine.kinds.canEvaluate(node.kind)) {
		return ctx.action.log(
			`[ERRO] ${node.kind}: kind sem implementação registrada para a habilidade "${ctx.skillId}".`,
		);
	}
	return ctx.engine.kinds.evaluate(node, ctx);
}

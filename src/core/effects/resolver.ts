import type { KindNode } from "../../engine/kinds";
import { windowPolicyOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { log } from "../reducer/utils";
import type { GameState } from "../state/gameState";
import type { PendingEffect } from "./stack";
import { MAX_STACK_DEPTH, orderPending } from "./stack";
import { pausedOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf, withEffectStack, effectStackOf } from "../state/access";

function ruleFor(engine: GameEngine, cause: string): "lifo" | "fifo" {
	return windowPolicyOf(engine)(cause);
}

export function resolveEffect(
	engine: GameEngine,
	state: GameState,
	pending: PendingEffect,
): GameState {
	const effect = pending.effect;
	const name = (effect["kind"] ?? effect["type"]) as string | undefined;
	if (name === undefined) return state;
	if (!engine.kinds.canResolve(name)) {
		return log(
			state,
			`[ERRO] efeito "${name}" sem implementação registrada (origem: ${pending.source}).`,
		);
	}
	const descriptor = (effect["kind"] === name ? effect : { ...effect, kind: name }) as KindNode;
	return engine.kinds.resolve(state, descriptor, { engine, pending }).state;
}

// Drena a stack até esvaziar, aplicando efeitos na ordem determinística.
// Garante terminação via MAX_STACK_DEPTH.
export function drainStack(engine: GameEngine, state: GameState): GameState {
	let iterations = 0;

	while (effectStackOf(state).pending.length > 0) {
		if (++iterations > MAX_STACK_DEPTH) {
			throw new Error(
				`[effectStack] profundidade máxima atingida (${MAX_STACK_DEPTH}). ` +
					"Possível loop de efeito — verifique TriggerComponents encadeados.",
			);
		}

		if (
			pausedOf(state) !== null ||
			pendingTriggerInterruptOf(state) ||
			pendingSkillChoiceOf(state) ||
			pendingSkillTargetOf(state)
		) break;

		const rule = ruleFor(engine, effectStackOf(state).pending[0]!.cause);
		const ordered = orderPending(effectStackOf(state).pending, rule);
		const [next] = ordered as [PendingEffect, ...PendingEffect[]];

		state = withEffectStack(state, {
				pending: effectStackOf(state).pending.filter((p) => p.id !== next.id),
				resolving: next,
			});

		state = resolveEffect(engine, state, next);

		state = withEffectStack(state, { ...effectStackOf(state), resolving: null });
	}

	return state;
}

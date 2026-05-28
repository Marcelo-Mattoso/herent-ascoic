// Resolvedor de efeitos da stack.
// Passo 8: drena a stack de efeitos pendentes sem recursão direta no call stack.
//
// Fluxo por iteração:
//   1. Selecionar próximo PendingEffect conforme regra LIFO/FIFO do evento causador.
//   2. Mover de pending → resolving.
//   3. Aplicar via resolveEffect — pode emitir eventos que pushean novos pending.
//   4. Limpar resolving.
//   5. Repetir até stack vazia ou pausa solicitada.

import eventRules from "../../data/event_rules.json";
import type { EntityId } from "../ecs/types";
import type { GameState } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import { applyHeal } from "../systems/healSystem";
import { MAX_STACK_DEPTH, orderPending } from "./stack";
import type { PendingEffect } from "./stack";

type EventRule = "lifo" | "fifo";
const rules = eventRules as Record<string, EventRule>;

function ruleFor(cause: string): EventRule {
	return rules[cause] ?? "lifo";
}

// Aplica um único efeito pendente ao estado.
// Pode causar novos emits que empurram efeitos à stack — drainStack captura na próxima iteração.
export function resolveEffect(state: GameState, pending: PendingEffect): GameState {
	const effect = pending.effect;
	const effectType = effect["type"] as string | undefined;

	switch (effectType) {
		case "apply_damage": {
			const targetId = effect["targetId"] as EntityId;
			const amount = effect["amount"] as number;
			return applyDamage(state, targetId, amount, {
				sourceId: pending.source,
				damageType: "physical",
			});
		}

		case "apply_heal": {
			const targetId = effect["targetId"] as EntityId;
			const amount = effect["amount"] as number;
			return applyHeal(state, targetId, amount);
		}

		case "noop":
			return state;

		default:
			// Efeito desconhecido: ignorado silenciosamente.
			// Passo 9+ adicionará tratamento rigoroso.
			return state;
	}
}

// Drena a stack até esvaziar, aplicando efeitos na ordem determinística.
// Garante terminação via MAX_STACK_DEPTH — loop infinito vira erro explícito.
export function drainStack(state: GameState): GameState {
	let iterations = 0;

	while (state.effectStack.pending.length > 0) {
		if (++iterations > MAX_STACK_DEPTH) {
			throw new Error(
				`[effectStack] profundidade máxima atingida (${MAX_STACK_DEPTH}). ` +
				"Possível loop de efeito — verifique TriggerComponents encadeados.",
			);
		}

		// Se pausado aguardando input do jogador, sair do loop.
		if (state.paused !== null) break;

		const rule = ruleFor(state.effectStack.pending[0]!.cause);
		const ordered = orderPending(state.effectStack.pending, rule);
		const [next, ...remaining] = ordered as [PendingEffect, ...PendingEffect[]];

		// Remover do pending e marcar como resolving.
		state = {
			...state,
			effectStack: {
				pending: state.effectStack.pending.filter((p) => p.id !== next.id),
				resolving: next,
			},
		};

		state = resolveEffect(state, next);

		// Limpar resolving após aplicação.
		state = {
			...state,
			effectStack: { ...state.effectStack, resolving: null },
		};
	}

	return state;
}

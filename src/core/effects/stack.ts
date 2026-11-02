// Tipos e helpers do effect stack.
// Separado de resolver.ts para evitar dependência circular com gameState.ts.
//
// Passo 8: efeitos encadeados são enfileirados aqui em vez de aplicados
// imediatamente, permitindo resolução ordenada sem recursão direta no call stack.

import type { PendingChoice } from "../../engine/choice";
import { orderEntries, pushEntry } from "../../engine/stack";
import type { EffectDescriptor, EntityId } from "../ecs/types";

export const MAX_STACK_DEPTH = 64;

export interface PendingEffect {
	readonly id: string;
	readonly seq: number; // ordem de adição (0-based)
	readonly cause: string; // EventType que gerou este efeito
	readonly effect: EffectDescriptor;
	readonly source: EntityId;
}

export interface EffectStack {
	readonly pending: readonly PendingEffect[];
	readonly resolving: PendingEffect | null;
}

export type PauseReason = string;

export interface ChoiceOption {
	readonly id: string;
	readonly label: string;
}

export interface PausedState {
	readonly choice: PendingChoice;
	readonly resumeFrom: PendingEffect;
}

export function createEmptyEffectStack(): EffectStack {
	return { pending: [], resolving: null };
}

// Enfileira um efeito pendente na stack, atribuindo id e seq automaticamente.
// Recebe apenas a EffectStack, não o GameState completo, para evitar ciclos.
export function addPending(
	stack: EffectStack,
	params: Omit<PendingEffect, "id" | "seq">,
): EffectStack {
	return pushEntry(stack, params) as EffectStack;
}

// Ordem de resolução para cada tipo de evento, conforme event_rules.json.
// LIFO = último adicionado resolve primeiro (estilo MTG stack).
// FIFO = primeiro adicionado resolve primeiro.
export function orderPending(
	pending: readonly PendingEffect[],
	rule: "lifo" | "fifo",
): readonly PendingEffect[] {
	return orderEntries(pending, rule) as readonly PendingEffect[];
}

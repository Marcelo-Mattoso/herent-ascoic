// Resolvedor de efeitos declarativos para o event bus.
// Interpreta EffectDescriptor e aplica o efeito correspondente.
// Passo 7: accumulator effects (modify_damage_amount, modify_heal_amount).
// Passo 8: push_to_stack — adia efeito para drenagem posterior (sem recursão direta).

import type { EffectDescriptor, EntityId } from "../ecs/types";
import { addPending } from "../effects/stack";
import type { GameState } from "../state/gameState";
import type { GameEvent } from "./types";

export function applyEffect(
	state: GameState,
	event: GameEvent,
	entityId: EntityId,
	effect: EffectDescriptor,
): { state: GameState; event: GameEvent } {
	const effectType = effect["type"] as string | undefined;

	switch (effectType) {
		case "modify_damage_amount": {
			// Reduz (delta < 0) ou aumenta (delta > 0) o dano prestes a ser causado.
			// Só atua se o alvo do dano for esta entidade.
			if (event.type !== "DamageAboutToBeDealt") return { state, event };
			if (event.payload.targetId !== entityId) return { state, event };
			const delta = effect["delta"] as number;
			const minVal = (effect["min"] as number | undefined) ?? 0;
			const newAmount = Math.max(minVal, event.payload.amount + delta);
			return {
				state,
				event: {
					...event,
					payload: { ...event.payload, amount: newAmount },
				},
			};
		}

		case "modify_heal_amount": {
			// Modifica a quantidade de cura prestes a ser aplicada.
			if (event.type !== "HealAboutToBeApplied") return { state, event };
			if (event.payload.targetId !== entityId) return { state, event };
			const delta = effect["delta"] as number;
			const minVal = (effect["min"] as number | undefined) ?? 0;
			const newAmount = Math.max(minVal, event.payload.amount + delta);
			return {
				state,
				event: {
					...event,
					payload: { ...event.payload, amount: newAmount },
				},
			};
		}

		case "push_to_stack": {
			// Adia um efeito interno para a stack — não aplicado imediatamente.
			// Permite cadeias sem recursão direta: listener define O QUÊ, drainStack resolve QUANDO.
			//
			// targetFilter: "self" → só empurra se o evento é direcionado a esta entidade.
			// Sem targetFilter → empurra sempre (para eventos sem targetId).
			const targetFilter = effect["targetFilter"] as string | undefined;
			if (targetFilter === "self") {
				const payload = event.payload as { targetId?: string };
				if (payload.targetId !== entityId) return { state, event };
			}
			const cause = (effect["cause"] as string | undefined) ?? event.type;
			const innerEffect = effect["innerEffect"] as EffectDescriptor;
			const newStack = addPending(state.effectStack, {
				cause,
				effect: innerEffect,
				source: entityId,
			});
			return { state: { ...state, effectStack: newStack }, event };
		}

		default:
			// Efeitos não reconhecidos: ignorados. drainStack os capturaria e ignoraria também.
			return { state, event };
	}
}

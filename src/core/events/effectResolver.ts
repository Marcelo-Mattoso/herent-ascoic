// Resolvedor de efeitos declarativos para o event bus.
// Interpreta EffectDescriptor e aplica o efeito correspondente.
// Passo 7: cobre os efeitos básicos necessários para pré-janelas de dano e cura.
// Passo 8 expande isso com o effect stack completo.

import type { EffectDescriptor, EntityId } from "../ecs/types";
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

		default:
			// Efeitos não reconhecidos são ignorados silenciosamente no Passo 7.
			// O stack completo do Passo 8 adicionará tratamento de erros adequado.
			return { state, event };
	}
}

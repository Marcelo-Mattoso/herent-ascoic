// Barramento de eventos síncrono com janelas pré/pós.
// Passo 8: recursão é permitida quando chamada via drainStack → resolveEffect → system.
// Listeners devem usar push_to_stack (em vez de emit direto) para encadear efeitos.
//
// Fluxo:
//   emit(state, event)
//     → coleta TriggerComponents que escutam event.type
//     → ordena por priority (menor = primeiro), tiebreak por entityId
//     → aplica cada efeito via effectResolver (pode modificar event ou push à stack)
//     → retorna { state, event } com accumulator final

import type { Entity, TriggerComponent } from "../ecs/types";
import type { GameState } from "../state/gameState";
import { applyEffect } from "./effectResolver";
import type { GameEvent } from "./types";

export function emit(
	state: GameState,
	event: GameEvent,
): { state: GameState; event: GameEvent } {
	// Coletar todos os TriggerComponents que escutam este tipo de evento.
	const matching: Array<{ entity: Entity; trigger: TriggerComponent }> = [];
	for (const entity of Object.values(state.world.entities)) {
		for (const comp of entity.components) {
			if (comp.type === "trigger") {
				const trigger = comp as TriggerComponent;
				if (trigger.on === event.type) {
					matching.push({ entity, trigger });
				}
			}
		}
	}

	// Ordenar por prioridade (asc). Tiebreak por entityId (alfa) — determinístico.
	matching.sort((a, b) => {
		const pd = a.trigger.priority - b.trigger.priority;
		if (pd !== 0) return pd;
		return a.entity.id.localeCompare(b.entity.id);
	});

	// Aplicar cada listener em sequência, acumulando state e event.
	let currentState = state;
	let currentEvent = event;
	for (const { entity, trigger } of matching) {
		// Verificar condição opcional.
		if (trigger.condition && !trigger.condition(entity)) continue;
		const result = applyEffect(currentState, currentEvent, entity.id, trigger.effect);
		currentState = result.state;
		currentEvent = result.event;
	}

	return { state: currentState, event: currentEvent };
}

// Barramento de eventos síncrono com janelas pré/pós.
// Passo 7: eventos não disparam outros eventos (restrição removida no Passo 8).
//
// Fluxo:
//   emit(state, event)
//     → coleta TriggerComponents que escutam event.type
//     → ordena por priority (menor = primeiro), tiebreak por entityId
//     → aplica cada efeito via effectResolver
//     → retorna { state, event } com o accumulator final

import type { Entity, TriggerComponent } from "../ecs/types";
import type { GameState } from "../state/gameState";
import { applyEffect } from "./effectResolver";
import type { GameEvent } from "./types";

// Guard de reentrada: emit dentro de listener é proibido no Passo 7.
let _emitDepth = 0;

export function emit(
	state: GameState,
	event: GameEvent,
): { state: GameState; event: GameEvent } {
	if (_emitDepth > 0) {
		// Passo 7: recursão proibida. Passo 8 (effect stack) suportará encadeamento.
		throw new Error(
			`[bus] emit recursão proibida (Passo 7): tentativa de emitir "${event.type}" dentro de listener`,
		);
	}

	_emitDepth++;
	try {
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
	} finally {
		_emitDepth--;
	}
}

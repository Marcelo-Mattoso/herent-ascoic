// Barramento de eventos síncrono com janelas pré/pós.
// Passo 8: recursão é permitida quando chamada via drainStack → resolveEffect → system.
// Listeners devem usar push_to_stack (em vez de emit direto) para encadear efeitos.
// Patch-18 Lote F: suporte a condition com evento, consumeAfterFire.
//
// Fluxo:
//   emit(state, event)
//     → coleta TriggerComponents que escutam event.type
//     → ordena por priority (menor = primeiro), tiebreak por entityId
//     → aplica cada efeito via effectResolver (pode modificar event ou push à stack)
//     → retorna { state, event } com accumulator final

import type { Entity, TriggerComponent } from "../ecs/types";
import { removeComponent } from "../ecs/world";
import { cardSkills } from "../skills/lookup";
import type { GameState } from "../state/gameState";
import { applyEffect } from "./effectResolver";
import type { GameEvent } from "./types";

/**
 * Saves anteriores à pipeline canônica podem conter cópias ECS de gatilhos
 * declarados no catálogo. O TriggerEngine é o dono desses gatilhos; o bus só
 * executa componentes criados em runtime. Sem essa guarda, uma mesma skill
 * seria executada uma vez por cada pipeline.
 */
function isCatalogTriggerComponent(
	state: GameState,
	entityId: string,
	trigger: TriggerComponent,
): boolean {
	const effectType = trigger.effect["type"];
	if (effectType !== "run_skill" && effectType !== "queue_trigger_interrupt") {
		return false;
	}
	const skillId = trigger.effect["skillId"];
	if (typeof skillId !== "string") return false;
	const cardId =
		state.heroes.find((hero) => hero.id === entityId)?.cardId ??
		state.activeEnemies.find((enemy) => enemy.id === entityId)?.cardId;
	if (!cardId) return false;
	return cardSkills(cardId).some(
		({ def }) => def.id === skillId && def.operate_type === "op_triggered",
	);
}

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
		if (isCatalogTriggerComponent(currentState, entity.id, trigger)) continue;

		// Verificar condição opcional (com acesso ao evento e world).
		if (
			trigger.condition &&
			!trigger.condition(entity, currentEvent, currentState.world)
		)
			continue;

		// consumeAfterFire com scope != "game": guarda no oncePer registry em vez de remover.
		// O trigger fica instalado e volta a disparar quando o scope reseta.
		if (trigger.consumeAfterFire && trigger.consumeAfterFire.scope !== "game") {
			const scope = trigger.consumeAfterFire.scope as
				| "room"
				| "combat"
				| "round";
			const key = `${trigger.source}::${entity.id}`;
			if (currentState.combat?.oncePer?.[scope]?.[key]) continue; // já consumido neste scope
		}

		const result = applyEffect(
			currentState,
			currentEvent,
			entity.id,
			trigger.effect,
		);
		currentState = result.state;
		currentEvent = result.event;
		if (currentState.pendingTriggerInterrupt) break;

		if (trigger.consumeAfterFire) {
			if (trigger.consumeAfterFire.scope === "game") {
				// Remoção permanente (uma vez por jogo — sem reset).
				currentState = {
					...currentState,
					world: removeComponent(
						currentState.world,
						entity.id,
						(c) => c === trigger,
					),
				};
			} else {
				// Marca no oncePer registry; o trigger é reinstalado automaticamente ao reset do scope.
				const scope = trigger.consumeAfterFire.scope as
					| "room"
					| "combat"
					| "round";
				const key = `${trigger.source}::${entity.id}`;
				if (scope === "room") {
					currentState = {
						...currentState,
						oncePer: {
							...currentState.oncePer,
							room: {
								...(currentState.oncePer.room ??
									currentState.combat?.oncePer.room),
								[key]: true,
							},
						},
					};
				} else if (currentState.combat) {
					currentState = {
						...currentState,
						combat: {
							...currentState.combat,
							oncePer: {
								...currentState.combat.oncePer,
								[scope]: { ...currentState.combat.oncePer[scope], [key]: true },
							},
						},
					};
				}
			}
		}
	}

	return { state: currentState, event: currentEvent };
}

import { stampEvent } from "../../engine/events";
import type { Entity, TriggerComponent } from "../ecs/types";
import { removeComponent } from "../ecs/world";

import type { GameState } from "../state/gameState";
import { applyEffect } from "./effectResolver";
import { type GameEventDraft, type GameEventMap, isPreWindowEvent } from "./types";
import { skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { withWorld, worldOf, pendingTriggerInterruptOf } from "../state/access";
import { scopedFlagOf, withScopedFlag } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
/**
 * Saves anteriores à pipeline canônica podem conter cópias ECS de gatilhos
 * declarados no catálogo. O TriggerEngine é o dono desses gatilhos; o bus só
 * executa componentes criados em runtime. Sem essa guarda, uma mesma skill
 * seria executada uma vez por cada pipeline.
 */
function isCatalogTriggerComponent(engine: GameEngine,
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
		gameOf(state).heroes.find((hero) => hero.id === entityId)?.cardId ??
		gameOf(state).activeEnemies.find((enemy) => enemy.id === entityId)?.cardId;
	if (!cardId) return false;
	return skillsOf(engine, cardId).some(
		({ def }) => def.id === skillId && def.operate_type === "op_triggered",
	);
}

export function emit(engine: GameEngine,
	state: GameState,
	event: GameEventDraft,
): { state: GameState; event: GameEventDraft } {
	// Coletar todos os TriggerComponents que escutam este tipo de evento.
	const matching: Array<{ entity: Entity; trigger: TriggerComponent }> = [];
	for (const entity of Object.values(worldOf(state).entities)) {
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
		if (isCatalogTriggerComponent(engine, currentState, entity.id, trigger)) continue;

		// Verificar condição opcional (com acesso ao evento e world).
		if (
			trigger.condition &&
			!trigger.condition(entity, currentEvent, worldOf(currentState))
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
			if (scopedFlagOf(currentState, scope, "oncePer", key)) continue; // já consumido neste scope
		}

		const result = applyEffect(engine,
			currentState,
			currentEvent,
			entity.id,
			trigger.effect,
		);
		currentState = result.state;
		currentEvent = result.event;
		if (pendingTriggerInterruptOf(currentState)) break;

		if (trigger.consumeAfterFire) {
			if (trigger.consumeAfterFire.scope === "game") {
				// Remoção permanente (uma vez por jogo — sem reset).
				currentState = withWorld(currentState, removeComponent(
						worldOf(currentState),
						entity.id,
						(c) => c === trigger,
					));
			} else {
				// Marca no oncePer registry; o trigger é reinstalado automaticamente ao reset do scope.
				const scope = trigger.consumeAfterFire.scope as
					| "room"
					| "combat"
					| "round";
				const key = `${trigger.source}::${entity.id}`;
				if (scope === "room" || gameOf(currentState).combat) {
					currentState = withScopedFlag(currentState, scope, "oncePer", key);
				}
			}
		}
	}

	if (!isPreWindowEvent(currentEvent.type)) {
		currentState = withGame(currentState, (prevGame) => ({ ...prevGame, events: stampEvent<GameEventMap>(gameOf(currentState).events, currentEvent) }));
	}
	return { state: currentState, event: currentEvent };
}

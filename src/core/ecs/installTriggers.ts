// Installer de TriggerComponents para habilidades reativas.
// Patch-21 Lote B: converte operate_type + trigger.event em TriggerComponents no world.
//
// Princípio: skills.yaml é a fonte de verdade — a complexidade fica aqui.
// op_active / op_active_buff → fireOnUseSkill (mantido).
// op_passive → installPassive.
// op_triggered → installSkillTriggers (este arquivo).

import type { SkillRef } from "../data/cardTypes";
import type { SkillDefinition } from "../data/skillTypes";
import type { GameEvent } from "../events/types";
import type { EventName } from "../skills/dsl/types";
import { isManuallyActivatable } from "../skills/useSkill";
import {
	durationForTriggerEvent,
	gameEventForTriggerEvent,
	TRIGGER_EVENT_TO_GAME_EVENT,
	triggerMode,
	type TriggerSourceKind,
} from "../triggers/engine";
import type {
	ComponentPredicate,
	EffectDescriptor,
	Entity,
	EntityId,
	TriggerComponent,
} from "./types";
import { addComponent, type World } from "./world";

// ── Condição padrão de entidade por evento ────────────────────────────────────

type PayloadRecord = Record<string, unknown>;

function heroCondition(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as PayloadRecord;
		return (p["heroId"] as string | undefined) === entityId;
	};
}

function enemyCondition(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as PayloadRecord;
		return (p["enemyId"] as string | undefined) === entityId;
	};
}

function targetCondition(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as PayloadRecord;
		return (p["targetId"] as string | undefined) === entityId;
	};
}

function sourceCondition(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as PayloadRecord;
		return (p["sourceId"] as string | undefined) === entityId;
	};
}

/**
 * Retorna a condição de entidade padrão para o evento + tipo de entidade.
 * `isHero`: true se o entityId é de um herói, false se inimigo.
 */
function defaultEntityCondition(
	event: EventName,
	entityId: EntityId,
	isHero: boolean,
): ComponentPredicate | undefined {
	switch (event) {
		case "evt_attack_declared":
			return (_e: Entity, ev?: GameEvent) => {
				if (!ev) return false;
				const p = ev.payload as PayloadRecord;
				const sourceType = p["sourceType"] as "hero" | "enemy" | undefined;
				if (sourceType) {
					return sourceType === "hero"
						? isHero && p["heroId"] === entityId
						: !isHero && p["enemyId"] === entityId;
				}
				return isHero ? p["heroId"] === entityId : p["enemyId"] === entityId;
			};
		case "evt_roll":
			return isHero ? heroCondition(entityId) : undefined;
		case "evt_hit":
			return targetCondition(entityId);
		case "evt_damage_taken":
			return targetCondition(entityId);
		case "evt_damage_dealt":
			return sourceCondition(entityId);
		case "evt_kill":
			return sourceCondition(entityId);
		case "evt_destroy":
			return enemyCondition(entityId);
		case "evt_leave_play":
			return heroCondition(entityId);
		case "evt_targeted":
			return heroCondition(entityId);
		// Eventos sem condição de entidade específica (room-level, global)
		case "evt_combat_start":
		case "evt_combat_end":
		case "evt_round_start":
		case "evt_round_end":
		case "evt_room_reveal":
		case "evt_room_enter":
		case "evt_room_leave":
		case "evt_dungeon_discard":
		case "evt_enter_play":
			return undefined;
	}
}

// ── Passivos ───────────────────────────────────────────────────────────────────

export function isPassiveTrigger(def: SkillDefinition): boolean {
	return def.operate_type === "op_passive";
}

// ── Cobertura ──────────────────────────────────────────────────────────────────

export function hasTriggerCoverage(def: SkillDefinition): boolean {
	if (isManuallyActivatable(def)) return true;
	if (isPassiveTrigger(def)) return true;
	if (def.operate_type === "op_triggered" && def.trigger?.event) {
		return def.trigger.event in TRIGGER_EVENT_TO_GAME_EVENT;
	}
	return false;
}

// ── Instalação principal ───────────────────────────────────────────────────────

export function installSkillTriggers(
	world: World,
	entityId: EntityId,
	skills: readonly { def: SkillDefinition; ref: SkillRef }[],
): World {
	let w = world;

	// Determinar tipo de entidade
	const entity = w.entities[entityId];
	const isHero = entity?.type === "hero";
	const sourceKind: TriggerSourceKind = isHero ? "hero" : "enemy";

	for (const { def, ref } of skills) {
		if (isManuallyActivatable(def)) continue; // op_active / op_active_buff → useSkill
		if (isPassiveTrigger(def)) continue; // op_passive → installPassive

		if (def.operate_type !== "op_triggered") continue;
		const event = def.trigger?.event;
		if (!event) continue;
		const mode = triggerMode(def, sourceKind);

		const gameEvent = gameEventForTriggerEvent(event);
		if (!gameEvent) continue;

		const duration = durationForTriggerEvent(event);
		const condition = defaultEntityCondition(event, entityId, isHero);

		// Cooldown → consumeAfterFire
		const consumeAfterFire = def.cooldown
			? { scope: def.cooldown.scope as "game" | "room" | "round" }
			: undefined;

		// Combina params
		const mergedParams = {
			...(def.params ?? {}),
			...(ref.params ?? {}),
		};

		const effect: EffectDescriptor =
			mode === "prompt"
				? {
						type: "queue_trigger_interrupt",
						skillId: def.id,
						triggerEvent: event,
						params: mergedParams,
					}
				: {
						type: "run_skill",
						skillId: def.id,
						params: mergedParams,
					};

		const trigger: TriggerComponent = {
			type: "trigger",
			on: gameEvent,
			condition,
			effect,
			source: def.id,
			duration,
			priority: 0,
			...(consumeAfterFire ? { consumeAfterFire } : {}),
		};

		w = addComponent(w, entityId, trigger);
	}

	return w;
}

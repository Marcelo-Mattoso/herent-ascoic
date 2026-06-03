// Installer de TriggerComponents para habilidades reativas.
// Patch-21 Lote B: converte operate_type + trigger.event em TriggerComponents no world.
//
// Princípio: skills.yaml é a fonte de verdade — a complexidade fica aqui.
// op_active / op_active_buff → fireOnUseSkill (mantido).
// op_passive → installPassive.
// op_triggered → installSkillTriggers (este arquivo).

import type { SkillDefinition } from "../data/skillTypes";
import type { SkillRef } from "../data/cardTypes";
import { isManuallyActivatable } from "../skills/useSkill";
import type {
	ComponentPredicate,
	Duration,
	EffectDescriptor,
	EntityId,
	TriggerComponent,
} from "./types";
import { addComponent, type World } from "./world";
import type { GameEvent } from "../events/types";
import type { Entity } from "./types";
import type { EventName } from "../skills/dsl/types";

// ── Mapeamento evt_* → nome do evento do sistema ─────────────────────────────

const EVENT_TO_GAME: Record<EventName, string> = {
	evt_attack_declared: "RollAboutToHappen",
	evt_roll:            "RollResolved",
	evt_hit:             "DamageDealt",
	evt_damage_dealt:    "DamageDealt",
	evt_damage_taken:    "DamageAboutToBeDealt",
	evt_destroy:         "EnemyDestroyed",
	evt_kill:            "EnemyDestroyed",
	evt_combat_start:    "CombatStarted",
	evt_combat_end:      "CombatEnded",
	evt_round_start:     "RoundStarted",
	evt_round_end:       "RoundEnded",
	evt_room_reveal:     "RoomEntered",
	evt_room_enter:      "RoomEntered",
	evt_room_leave:      "CombatEnded",
	evt_dungeon_discard: "DungeonCardDiscarded",
	evt_enter_play:      "CombatStarted",
	evt_leave_play:      "HeroFled",
	evt_targeted:        "HeroTargeted",
};

// ── Durações padrão por evento ────────────────────────────────────────────────

const EVENT_DURATION: Record<EventName, Duration> = {
	evt_attack_declared: { kind: "this_combat" },
	evt_roll:            { kind: "this_combat" },
	evt_hit:             { kind: "this_combat" },
	evt_damage_dealt:    { kind: "this_combat" },
	evt_damage_taken:    { kind: "this_combat" },
	evt_destroy:         { kind: "this_combat" },
	evt_kill:            { kind: "this_combat" },
	evt_combat_start:    { kind: "this_combat" },
	evt_combat_end:      { kind: "this_combat" },
	evt_round_start:     { kind: "this_combat" },
	evt_round_end:       { kind: "this_combat" },
	evt_room_reveal:     { kind: "permanent" },
	evt_room_enter:      { kind: "permanent" },
	evt_room_leave:      { kind: "permanent" },
	evt_dungeon_discard: { kind: "permanent" },
	evt_enter_play:      { kind: "this_combat" },
	evt_leave_play:      { kind: "permanent" },
	evt_targeted:        { kind: "permanent" },
};

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
			return isHero ? heroCondition(entityId) : enemyCondition(entityId);
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
		return def.trigger.event in EVENT_TO_GAME;
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

	for (const { def, ref } of skills) {
		if (isManuallyActivatable(def)) continue; // op_active / op_active_buff → useSkill
		if (isPassiveTrigger(def)) continue;       // op_passive → installPassive

		if (def.operate_type !== "op_triggered") continue;
		const event = def.trigger?.event;
		if (!event) continue;

		const gameEvent = EVENT_TO_GAME[event];
		if (!gameEvent) continue;

		const duration = EVENT_DURATION[event] ?? { kind: "permanent" as const };
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

		const effect: EffectDescriptor = {
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

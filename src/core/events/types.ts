// Tipos de eventos do barramento interno.
// Passo 7: bus síncrono com janelas pré/pós para modificação de accumulators.

import type { EntityId } from "../ecs/types";

export type DamageType = "physical" | "magical" | "direct" | "condition";

export type EventType =
	| "DamageAboutToBeDealt"
	| "DamageDealt"
	| "HealAboutToBeApplied"
	| "HealApplied"
	| "EntityDefeated"
	| "RoomEntered"
	| "CombatStarted"
	| "CombatEnded"
	| "TurnStarted"
	| "TurnEnded"
	| "CardDrawn"
	| "SkillUsed";

// ── Payloads tipados ──────────────────────────────────────────────────────────

export interface DamageAboutToBeDealtPayload {
	readonly sourceId: EntityId;
	readonly targetId: EntityId;
	readonly damageType: DamageType;
	readonly amount: number; // accumulator — listeners retornam evento com amount modificado
}

export interface DamageDealtPayload {
	readonly sourceId: EntityId;
	readonly targetId: EntityId;
	readonly damageType: DamageType;
	readonly amount: number; // valor final após modificações
}

export interface HealAboutToBeAppliedPayload {
	readonly targetId: EntityId;
	readonly amount: number; // accumulator
}

export interface HealAppliedPayload {
	readonly targetId: EntityId;
	readonly amount: number;
}

export interface EntityDefeatedPayload {
	readonly entityId: EntityId;
	readonly entityType: "hero" | "enemy";
}

// ── União discriminada ────────────────────────────────────────────────────────

export type GameEvent =
	| {
			readonly type: "DamageAboutToBeDealt";
			readonly payload: DamageAboutToBeDealtPayload;
	  }
	| { readonly type: "DamageDealt"; readonly payload: DamageDealtPayload }
	| {
			readonly type: "HealAboutToBeApplied";
			readonly payload: HealAboutToBeAppliedPayload;
	  }
	| { readonly type: "HealApplied"; readonly payload: HealAppliedPayload }
	| { readonly type: "EntityDefeated"; readonly payload: EntityDefeatedPayload }
	| {
			readonly type: "RoomEntered";
			readonly payload: { readonly roomName: string };
	  }
	| { readonly type: "CombatStarted"; readonly payload: Record<string, never> }
	| { readonly type: "CombatEnded"; readonly payload: Record<string, never> }
	| {
			readonly type: "TurnStarted";
			readonly payload: { readonly heroId: EntityId };
	  }
	| {
			readonly type: "TurnEnded";
			readonly payload: { readonly heroId: EntityId };
	  }
	| {
			readonly type: "CardDrawn";
			readonly payload: { readonly cardName: string };
	  }
	| {
			readonly type: "SkillUsed";
			readonly payload: { readonly heroId: EntityId; readonly skillId: string };
	  };

// Tipos de eventos do barramento interno.
// Passo 7: bus síncrono com janelas pré/pós para modificação de accumulators.
// Patch-18 Lote E: catálogo completo de eventos reativos.

import type { EngineEvent, EngineEventDraft } from "../../engine/events";
import type { EntityId } from "../ecs/types";

export type DamageType =
	| "physical"
	| "magical"
	| "direct"
	| "condition"
	| "attack"
	| "purple";

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

export interface EntityWouldBeDestroyedPayload {
	readonly sourceId: EntityId;
	readonly targetId: EntityId;
	readonly damageType: DamageType;
	readonly amount: number;
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

// ── Mapa de eventos do jogo ───────────────────────────────────────────────────

export type GameEventMap = {
	DamageAboutToBeDealt: DamageAboutToBeDealtPayload;
	EntityWouldBeDestroyed: EntityWouldBeDestroyedPayload;
	DamageDealt: DamageDealtPayload;
	HealAboutToBeApplied: HealAboutToBeAppliedPayload;
	HealApplied: HealAppliedPayload;
	EntityDefeated: EntityDefeatedPayload;
	RoomEntered: { readonly roomId: string };
	CombatStarted: { readonly roomId: string };
	CombatEnded: Record<string, never>;
	RoomWon: { readonly roomId: string };
	TurnStarted: { readonly heroId: EntityId };
	TurnEnded: { readonly heroId: EntityId };
	CardDrawn: { readonly cardId: string };
	SkillUsed: { readonly sourceId: EntityId; readonly skillId: string };
	RollAboutToHappen: {
		readonly heroId: string;
		readonly enemyId: string;
		readonly round: number;
		readonly sourceType?: "hero" | "enemy";
	};
	RollResolved: {
		readonly heroId: string;
		readonly enemyId: string;
		readonly heroTotal: number;
		readonly enemyTotal: number;
		readonly heroResults: readonly number[];
		readonly enemyResults: readonly number[];
	};
	EnemyDestroyed: {
		readonly enemyId: string;
		readonly sourceId: string;
		readonly roomFirstKill: boolean;
	};
	HeroDefeated: { readonly heroId: string; readonly sourceId: string };
	HeroTargeted: {
		readonly heroId: string;
		readonly sourceId: string;
		readonly roomFirstTime: boolean;
	};
	HeroTargetedByEffect: {
		readonly heroId: string;
		readonly skillId: string;
		readonly roomFirstTime: boolean;
	};
	TargetChosen: {
		readonly sourceId: string;
		readonly targetId: string;
		readonly sourceType: "hero" | "enemy";
		readonly roomFirstTime: boolean;
	};
	HeroLostCombat: {
		readonly heroId: string;
		readonly enemyId: string;
		readonly roomFirstTime: boolean;
	};
	HeroFled: { readonly heroId: string };
	PathsRevealed: { readonly cards: readonly string[] };
	DungeonCardDiscarded: {
		readonly cardId: string;
		readonly reason: "effect" | "extra";
	};
	ItemEffectAppliedTo: {
		readonly heroId: string;
		readonly itemId: string;
		readonly sourceId: string;
		readonly roomFirstTime: boolean;
	};
	RoundEnded: { readonly round: number };
	RoundStarted: { readonly round: number };
	RoomLeft: { readonly roomId: string };
	EntityEnteredPlay: {
		readonly entityId: string;
		readonly entityType: "enemy";
	};
	StatusChanged: {
		readonly from: string;
		readonly to: string;
		readonly action: string;
	};
	DespertarChanged: {
		readonly from: number;
		readonly to: number;
		readonly cause: "level_up" | "effect" | "lowered";
	};
	RewardGranted: {
		readonly kind: "xp" | "item" | "artifact";
		readonly cardId?: string;
		readonly amount?: number;
	};
	ItemEquipped: { readonly heroId: string; readonly itemId: string };
	ItemStored: { readonly heroId: string; readonly itemId: string };
	ItemDiscarded: { readonly itemId: string };
};

export type EventType = keyof GameEventMap & string;

export type GameEvent = EngineEvent<GameEventMap>;
export type GameEventDraft = EngineEventDraft<GameEventMap>;

export type EventWindow = "pre" | "post";

export const EVENT_WINDOW: Readonly<Record<EventType, EventWindow>> = {
	DamageAboutToBeDealt: "pre",
	EntityWouldBeDestroyed: "pre",
	HealAboutToBeApplied: "pre",
	RollAboutToHappen: "pre",
	DamageDealt: "post",
	HealApplied: "post",
	EntityDefeated: "post",
	RoomEntered: "post",
	CombatStarted: "post",
	CombatEnded: "post",
	RoomWon: "post",
	TurnStarted: "post",
	TurnEnded: "post",
	CardDrawn: "post",
	SkillUsed: "post",
	RollResolved: "post",
	EnemyDestroyed: "post",
	HeroDefeated: "post",
	HeroTargeted: "post",
	HeroTargetedByEffect: "post",
	TargetChosen: "post",
	HeroLostCombat: "post",
	HeroFled: "post",
	PathsRevealed: "post",
	DungeonCardDiscarded: "post",
	ItemEffectAppliedTo: "post",
	RoundEnded: "post",
	RoundStarted: "post",
	RoomLeft: "post",
	EntityEnteredPlay: "post",
	StatusChanged: "post",
	DespertarChanged: "post",
	RewardGranted: "post",
	ItemEquipped: "post",
	ItemStored: "post",
	ItemDiscarded: "post",
};

export function isPreWindowEvent(type: string): boolean {
	return (EVENT_WINDOW as Readonly<Record<string, EventWindow>>)[type] === "pre";
}

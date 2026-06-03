// Tipos de eventos do barramento interno.
// Passo 7: bus síncrono com janelas pré/pós para modificação de accumulators.
// Patch-18 Lote E: catálogo completo de eventos reativos.

import type { EntityId } from "../ecs/types";

export type DamageType = "physical" | "magical" | "direct" | "condition" | "attack" | "purple";

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
	| "SkillUsed"
	// Lote E
	| "RollAboutToHappen"
	| "RollResolved"
	| "EnemyDestroyed"
	| "HeroDefeated"
	| "HeroTargeted"
	| "HeroTargetedByEffect"
	| "TargetChosen"
	| "HeroLostCombat"
	| "HeroFled"
	| "PathsRevealed"
	| "DungeonCardDiscarded"
	| "ItemEffectAppliedTo"
	| "RoundEnded"
	| "RoundStarted"
	// patch-23 Lote F
	| "RoomLeft"
	| "EntityEnteredPlay";

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
			readonly payload: { readonly roomId: string };
	  }
	| { readonly type: "CombatStarted"; readonly payload: { readonly roomId: string } }
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
			readonly payload: { readonly cardId: string };
	  }
	| {
			readonly type: "SkillUsed";
			readonly payload: { readonly sourceId: EntityId; readonly skillId: string };
	  }
	// ── Lote E ────────────────────────────────────────────────────────────────
	| {
			readonly type: "RollAboutToHappen";
			readonly payload: { readonly heroId: string; readonly enemyId: string; readonly round: number };
	  }
	| {
			readonly type: "RollResolved";
			readonly payload: {
				readonly heroId: string;
				readonly enemyId: string;
				readonly heroTotal: number;
				readonly enemyTotal: number;
				readonly heroResults: readonly number[];
				readonly enemyResults: readonly number[];
			};
	  }
	| {
			readonly type: "EnemyDestroyed";
			readonly payload: {
				readonly enemyId: string;
				readonly sourceId: string;
				readonly roomFirstKill: boolean;
			};
	  }
	| {
			readonly type: "HeroDefeated";
			readonly payload: { readonly heroId: string; readonly sourceId: string };
	  }
	| {
			readonly type: "HeroTargeted";
			readonly payload: {
				readonly heroId: string;
				readonly sourceId: string;
				readonly roomFirstTime: boolean;
			};
	  }
	| {
			readonly type: "HeroTargetedByEffect";
			readonly payload: {
				readonly heroId: string;
				readonly skillId: string;
				readonly roomFirstTime: boolean;
			};
	  }
	| {
			readonly type: "TargetChosen";
			readonly payload: {
				readonly sourceId: string;
				readonly targetId: string;
				readonly sourceType: "hero" | "enemy";
				readonly roomFirstTime: boolean;
			};
	  }
	| {
			readonly type: "HeroLostCombat";
			readonly payload: {
				readonly heroId: string;
				readonly enemyId: string;
				readonly roomFirstTime: boolean;
			};
	  }
	| {
			readonly type: "HeroFled";
			readonly payload: { readonly heroId: string };
	  }
	| {
			readonly type: "PathsRevealed";
			readonly payload: { readonly cards: readonly string[] };
	  }
	| {
			readonly type: "DungeonCardDiscarded";
			readonly payload: { readonly cardId: string; readonly reason: "effect" | "extra" };
	  }
	| {
			readonly type: "ItemEffectAppliedTo";
			readonly payload: {
				readonly heroId: string;
				readonly itemId: string;
				readonly sourceId: string;
				readonly roomFirstTime: boolean;
			};
	  }
	| {
			readonly type: "RoundEnded";
			readonly payload: { readonly round: number };
	  }
	| {
			readonly type: "RoundStarted";
			readonly payload: { readonly round: number };
	  }
	// Emitido quando o grupo avança para uma nova sala (após vitória/recompensa).
	| {
			readonly type: "RoomLeft";
			readonly payload: { readonly roomId: string };
	  }
	// Emitido quando uma entidade (criatura inicial ou spawn mid-combat) entra em jogo.
	| {
			readonly type: "EntityEnteredPlay";
			readonly payload: { readonly entityId: string; readonly entityType: "enemy" };
	  };

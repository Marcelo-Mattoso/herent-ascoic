// Tipos do ECS (Entity-Component System).
// Componentes são dados puros — sem métodos, sem referências vivas.
// Entidades são apenas IDs + listas de componentes.

import type { ColorIndex } from "../state/color";
import type { ItemSlotType } from "../state/heroState";

export type EntityId = string;

export type EntityType = "hero" | "enemy" | "room" | "item_in_play" | "subboss";

export interface Entity {
	readonly id: EntityId;
	readonly type: EntityType;
	readonly components: readonly Component[];
}

// Stubs para tipos que chegarão no Passo 7 (Event Bus).
export type EventType = string;
export type EffectDescriptor = Readonly<Record<string, unknown>>;
// Predicate de componente: recebe entidade + contexto do evento para filtros reativos.
export type ComponentPredicate = (
	entity: Entity,
	event?: import("../events/types").GameEvent,
	world?: import("./world").World,
) => boolean;

export type Duration =
	| { readonly kind: "permanent" }
	| { readonly kind: "this_turn" }
	| { readonly kind: "this_combat" }
	| { readonly kind: "rounds"; readonly remaining: number }
	| { readonly kind: "once" }
	// Expira quando a entidade-fonte (sourceEntityId) é removida do world.
	// removeModifiersForSource(world, sourceEntityId) limpa estes modifiers.
	| { readonly kind: "while_source_in_play" };

// ── Componentes core (intrínsecos ao tipo de entidade) ──────────────────────

export interface HealthComponent {
	readonly type: "health";
	readonly current: number;
	readonly max: number;
	readonly healBlocked: boolean;
}

export interface DamageStatComponent {
	readonly type: "damage_stat";
	readonly damage: number;
	readonly hitBonus: number;
}

export interface DiceComponent {
	readonly type: "dice";
	readonly count: number;
}

export interface ImpetoComponent {
	readonly type: "impeto";
	readonly level: ColorIndex;
}

// ── Componentes plugáveis (adicionados/removidos dinamicamente) ──────────────

export interface ConditionComponent {
	readonly type: "condition";
	readonly conditionType: string;
	readonly duration: Duration;
}

export interface ItemEquippedComponent {
	readonly type: "item_equipped";
	readonly itemId: string;
	readonly slot: ItemSlotType;
}

export interface ItemBackpackComponent {
	readonly type: "item_backpack";
	readonly items: readonly string[];
}

export interface TokenComponent {
	readonly type: "token";
	readonly tokenType: string;
	readonly count: number;
}

export interface ModifierComponent {
	readonly type: "modifier";
	readonly target:
		| "damage_dealt"
		| "damage_taken"
		| "purple_damage_taken"
		| "healing_received"
		| "dice_count"
		| "hit_bonus";
	readonly operation: "add" | "multiply" | "set" | "clamp";
	readonly value: number;
	readonly source: EntityId;
	readonly duration: Duration;
	readonly condition?: ComponentPredicate;
	// Preenchido quando duration.kind === "while_source_in_play".
	// Identifica a entidade que aplicou este modifier — ao ser removida do world,
	// removeModifiersForSource() limpa todos os modifiers com este sourceEntityId.
	readonly sourceEntityId?: EntityId;
}

export interface TriggerComponent {
	readonly type: "trigger";
	readonly on: EventType;
	readonly condition?: ComponentPredicate;
	readonly effect: EffectDescriptor;
	readonly source: EntityId;
	/** Entidade que instalou o gatilho em runtime, para limpeza ao sair de jogo. */
	readonly sourceEntityId?: EntityId;
	readonly duration: Duration;
	readonly priority: number;
	// consumeAfterFire: remove o trigger após disparar uma vez (once_per_*)
	readonly consumeAfterFire?: { readonly scope: "game" | "room" | "round" };
}

export type Component =
	| HealthComponent
	| DamageStatComponent
	| DiceComponent
	| ImpetoComponent
	| ConditionComponent
	| ItemEquippedComponent
	| ItemBackpackComponent
	| TokenComponent
	| ModifierComponent
	| TriggerComponent;

export type ComponentType = Component["type"];

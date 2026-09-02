// Tipos puros da DSL de habilidades (Patch-12 Fase 1).
// Discriminados por `kind`. Sem dependências de runtime — apenas tipos.

// ── Expressões ───────────────────────────────────────────────────────────────

/** Operação aritmética binária. */
export interface ArithExpr {
	readonly op: "add" | "sub" | "mul" | "div" | "min" | "max";
	readonly args: readonly [ExprNode, ExprNode];
}

/**
 * Array de 5 valores indexado por despertar (white=0 … purple=4).
 * `null` na posição = efeito não dispara neste nível de despertar.
 */
export type ColorByAwakening = readonly [
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
];

/**
 * Nó de expressão.
 * - `number` → literal
 * - `string` → referência simbólica (`"$cost"`, `"$source"`, `"$target"`, etc.)
 * - `ArithExpr` → aritmética binária
 * - `ColorByAwakening` → valor indexado por nível de despertar
 */
export type ExprNode = number | string | ArithExpr | ColorByAwakening;

// ── Condições ────────────────────────────────────────────────────────────────

export type ConditionNode =
	| {
			readonly kind: "has_skill";
			readonly of: string;
			readonly skillId: string;
	  }
	| {
			readonly kind: "has_condition";
			readonly of: string;
			readonly conditionType: string;
	  }
	| {
			readonly kind: "compare";
			readonly op: "lt" | "lte" | "eq" | "gte" | "gt" | "in";
			readonly left: ExprNode;
			readonly right: ExprNode;
	  }
	| { readonly kind: "and"; readonly children: readonly ConditionNode[] }
	| { readonly kind: "or"; readonly children: readonly ConditionNode[] }
	| { readonly kind: "not"; readonly child: ConditionNode }
	/** Atalho OR para conditions[]: `any_of` satisfaz se qualquer filho satisfaz. */
	| { readonly any_of: readonly ConditionNode[] };

// ── Durações ─────────────────────────────────────────────────────────────────

export type DurationNode =
	| { readonly kind: "once" }
	| { readonly kind: "until_end_of_round" }
	| { readonly kind: "until_end_of_combat" }
	| { readonly kind: "while_in_play" }
	| { readonly kind: "permanent" }
	| { readonly kind: "passive" }
	| { readonly kind: "once_per_round" };

// ── Effects ──────────────────────────────────────────────────────────────────

/** Stats prefixados s_* (patch-21 Lote E). Closed union — stat fora do catálogo = erro de compile. */
export type ModifierStat =
	| "s_damage_reduction"
	| "s_purple_damage_reduction"
	| "s_hit_bonus"
	| "s_hit_penalty"
	| "s_damage_dealt"
	| "s_damage_penalty"
	| "s_heal_blocked"
	| "s_flee_blocked"
	| "s_dungeon_discard_prevention"
	| "s_dungeon_discard_locked"
	| "s_first_damage_prevented";

export type BlockActionTarget =
	| "flee"
	| "heal"
	| "dungeon_discard"
	| "power_use"
	| "dungeon_level_reduction";

export type DrawPile = "dungeon" | "item_deck" | "artifact_deck";
export type DiscardPile = "dungeon" | "item";

export type EffectNode =
	// Dano / cura (i_*)
	| {
			readonly kind: "i_damage";
			readonly to: string;
			readonly amount: ExprNode;
			readonly minimum?: number;
	  }
	| {
			readonly kind: "i_heal";
			readonly to: string;
			readonly amount: ExprNode;
	  }
	| { readonly kind: "i_full_heal"; readonly to: string }
	| { readonly kind: "i_prevent_destroy"; readonly to: string }
	// Modificadores / componentes ECS (p_*)
	| {
			readonly kind: "p_modifier";
			readonly to: string;
			readonly stat: ModifierStat;
			readonly operation: "add" | "multiply" | "set";
			readonly value: ExprNode;
			readonly duration: DurationNode;
			readonly condition?: ConditionNode;
			readonly sourceEntityId?: string;
	  }
	| {
			readonly kind: "add_trigger";
			readonly to: string;
			readonly on: string;
			readonly effect: readonly EffectNode[];
			readonly duration: DurationNode;
			readonly condition?: ConditionNode;
			readonly priority?: number;
	  }
	| {
			readonly kind: "p_block";
			readonly what: BlockActionTarget;
			readonly duration?: DurationNode;
			readonly sourceEntityId?: string;
	  }
	// Decks (i_*)
	| {
			readonly kind: "i_discard";
			readonly pile: DiscardPile;
			readonly count: ExprNode;
			readonly who?: string;
	  }
	| {
			readonly kind: "i_draw";
			readonly pile: DrawPile;
			readonly count: ExprNode;
	  }
	// Dungeon (i_*)
	| { readonly kind: "i_advance_dungeon"; readonly amount: ExprNode }
	// Misc (i_*)
	| { readonly kind: "i_set_no_reward"; readonly to: string }
	| { readonly kind: "i_prevent_next_damage"; readonly to: string }
	| { readonly kind: "i_ignore_next_targeting"; readonly to: string }
	| { readonly kind: "i_recover_dungeon"; readonly count: ExprNode }
	| { readonly kind: "i_mark_target"; readonly to: string }
	| { readonly kind: "i_prevent_dungeon_discard" }
	| {
			readonly kind: "i_draw_and_choose";
			readonly pile: DrawPile;
			readonly reveal: ExprNode;
			readonly keep: ExprNode;
	  }
	| { readonly kind: "i_reveal_dungeon"; readonly count: ExprNode }
	| {
			readonly kind: "i_grant_reward";
			readonly rewardType: "item" | "artifact";
			readonly cardId: string;
	  }
	// Composição (i_*)
	| {
			readonly kind: "i_if";
			readonly when: ConditionNode;
			readonly then: readonly EffectNode[];
			readonly else?: readonly EffectNode[];
	  }
	| {
			readonly kind: "i_choose_one";
			readonly options: ReadonlyArray<{
				readonly id: string;
				readonly params?: Readonly<Record<string, number | string>>;
				readonly effect: readonly EffectNode[];
			}>;
	  }
	| {
			readonly kind: "i_for_each";
			readonly over: "targets" | "allies" | "enemies" | "all_heroes" | "$each";
			readonly as: string;
			readonly do: readonly EffectNode[];
	  }
	| { readonly kind: "i_noop" }
	// ── Dado (patch-21 Lote F) ───────────────────────────────────────────────────
	| {
			readonly kind: "i_modify_die";
			readonly delta: ExprNode;
			readonly die_side: "hero" | "enemy" | "any";
			readonly hero_id?: string;
			readonly skill_id?: string;
	  }
	| {
			readonly kind: "i_reroll";
			readonly die_side: "hero" | "enemy" | "any";
			readonly only_if_value?: ExprNode;
			readonly hero_id?: string;
			readonly skill_id?: string;
	  }
	| {
			readonly kind: "i_set_die";
			readonly value: ExprNode;
			readonly die_side: "hero" | "enemy" | "any";
			readonly hero_id?: string;
			readonly skill_id?: string;
	  }
	// ── Status (patch-21 Lote F) ─────────────────────────────────────────────────
	| {
			readonly kind: "i_dispel";
			readonly category: string;
	  }
	| {
			readonly kind: "i_remove_status";
			readonly status: string;
	  };

// ── Trigger v2 (patch-21 Lote B) ────────────────────────────────────────────

// ── Nature (patch-21 Lote D) ─────────────────────────────────────────────────

export type Nature =
	// Tipo
	| "nat_physical"
	| "nat_magical"
	// Elementos
	| "nat_fire"
	| "nat_water"
	| "nat_earth"
	| "nat_wind"
	| "nat_holy"
	| "nat_dark"
	// Estados
	| "nat_bleed"
	| "nat_poison"
	| "nat_shock"
	| "nat_paralyze"
	| "nat_sleep"
	| "nat_hold"
	| "nat_derangement"
	// Especiais
	| "nat_death"
	| "nat_true";

// ── Targeting v2 (patch-21 Lote C) ──────────────────────────────────────────

export type TargetType =
	| "tgt_self"
	| "tgt_target"
	| "tgt_enemy"
	| "tgt_item"
	| "tgt_others"
	| "tgt_none";

export type AffectScope =
	| "scp_single"
	| "scp_party_full"
	| "scp_dead_party"
	| "scp_room"
	| "scp_none";

export type AffectObject = "obj_friend" | "obj_not_friend" | "obj_all";

export interface AffectLimit {
	readonly min: number;
	readonly max: number;
}

export type OperateType =
	| "op_active"
	| "op_active_buff"
	| "op_triggered"
	| "op_passive";

export type EventName =
	// Combate
	| "evt_attack_declared"
	| "evt_roll"
	| "evt_hit"
	| "evt_damage_dealt"
	| "evt_damage_taken"
	| "evt_destroy"
	| "evt_kill"
	// Ciclo
	| "evt_combat_start"
	| "evt_combat_end"
	| "evt_round_start"
	| "evt_round_end"
	// Sala
	| "evt_room_reveal"
	| "evt_room_enter"
	| "evt_room_leave"
	| "evt_dungeon_discard"
	// Entidade
	| "evt_enter_play"
	| "evt_leave_play"
	| "evt_targeted";

export type CooldownScope = "game" | "room" | "combat" | "round";

export interface CooldownNode {
	readonly scope: CooldownScope;
	readonly charges: number;
}

// ── Trigger legado (pré-patch-21 — mantido para resolveTrigger.ts) ───────────

export type LimitKind =
	| "once_per_game"
	| "once_per_combat"
	| "once_per_room"
	| "once_per_round";

/** Trigger no formato objeto pós-patch-12 (legado). */
export interface TriggerObject {
	readonly on: string;
	readonly when?: ConditionNode;
	readonly limit?: LimitKind;
}

// ── EvalCtx — contexto passado para o evaluator ──────────────────────────────

import type { Component } from "../../ecs/types";
import type { GameState } from "../../state/gameState";

export interface EvalCtx {
	readonly state: GameState;
	readonly skillId: string;
	readonly params: Readonly<Record<string, unknown>>;
	/** Entidade que disparou a skill (heroId ou enemyId). */
	readonly sourceId: string | null;
	/** Alvo primário resolvido. */
	readonly targetId: string | null;
	/** Todos os alvos resolvidos. */
	readonly targetIds: readonly string[];

	// Consultas de estado — puras, sem mutação.
	readonly query: {
		creatureHasSkill(enemyId: string, skillId: string): boolean;
		dungeonLevel(): number;
		roomEnemyCount(): number;
		heroWithLowestLife(): string | null;
	};

	// Ações — retornam novo GameState sem mutar o atual.
	// Todas passam pelo pipeline (pushEffect → EffectStack, addComponent → ECS).
	readonly action: {
		pushEffect(node: EffectNode): GameState;
		addComponent(entityId: string, component: Component): GameState;
		requestChoice(
			options: ReadonlyArray<{ readonly id: string; readonly label: string }>,
		): GameState;
		log(msg: string): GameState;
	};

	/** Retorna novo EvalCtx com estado atualizado (para sequenciar efeitos). */
	readonly withState: (s: GameState) => EvalCtx;
}

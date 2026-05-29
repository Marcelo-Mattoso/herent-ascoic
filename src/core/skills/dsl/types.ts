// Tipos puros da DSL de habilidades (Patch-12 Fase 1).
// Discriminados por `kind`. Sem dependências de runtime — apenas tipos.

// ── Expressões ───────────────────────────────────────────────────────────────

/** Operação aritmética binária. */
export interface ArithExpr {
	readonly op: "add" | "sub" | "mul" | "div" | "min" | "max";
	readonly args: readonly [ExprNode, ExprNode];
}

/**
 * Nó de expressão.
 * - `number` → literal
 * - `string` → referência simbólica (`"$cost"`, `"$source"`, `"$target"`, etc.)
 * - `ArithExpr` → aritmética binária
 */
export type ExprNode = number | string | ArithExpr;

// ── Condições ────────────────────────────────────────────────────────────────

export type ConditionNode =
	| { readonly kind: "has_skill"; readonly of: string; readonly skillId: string }
	| { readonly kind: "has_condition"; readonly of: string; readonly conditionType: string }
	| {
			readonly kind: "compare";
			readonly op: "lt" | "lte" | "eq" | "gte" | "gt" | "in";
			readonly left: ExprNode;
			readonly right: ExprNode;
	  }
	| { readonly kind: "and"; readonly children: readonly ConditionNode[] }
	| { readonly kind: "or"; readonly children: readonly ConditionNode[] }
	| { readonly kind: "not"; readonly child: ConditionNode };

// ── Durações ─────────────────────────────────────────────────────────────────

export type DurationNode =
	| { readonly kind: "once" }
	| { readonly kind: "until_end_of_round" }
	| { readonly kind: "until_end_of_combat" }
	| { readonly kind: "while_in_play" }
	| { readonly kind: "passive" }
	| { readonly kind: "once_per_round" };

// ── Effects ──────────────────────────────────────────────────────────────────

/** Stats reconhecidos por `add_modifier`. Extensível via string literal. */
export type ModifierStat =
	| "damage_reduction"
	| "purple_damage_reduction"
	| "tohit_bonus"
	| "tohit_penalty"
	| "damage_bonus"
	| "damage_penalty"
	| "heal_blocked"
	| "flee_blocked"
	| "dungeon_discard_prevention"
	| "dungeon_discard_locked"
	| "first_damage_prevented"
	| (string & {});

export type BlockActionTarget =
	| "flee"
	| "heal"
	| "dungeon_discard"
	| "power_use"
	| "dungeon_level_reduction";

export type DrawPile = "dungeon" | "item_deck" | "artifact_deck";
export type DiscardPile = "dungeon" | "item";

export type EffectNode =
	// Dano / cura
	| { readonly kind: "apply_damage"; readonly to: string; readonly amount: ExprNode; readonly minimum?: number }
	| { readonly kind: "apply_heal"; readonly to: string; readonly amount: ExprNode }
	| { readonly kind: "apply_full_heal"; readonly to: string }
	| { readonly kind: "prevent_destroy"; readonly to: string }
	// Modificadores / componentes ECS
	| {
			readonly kind: "add_modifier";
			readonly to: string;
			readonly stat: ModifierStat;
			readonly operation: "add" | "multiply" | "set";
			readonly value: ExprNode;
			readonly duration: DurationNode;
			readonly condition?: ConditionNode;
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
	| { readonly kind: "block_action"; readonly what: BlockActionTarget }
	// Decks
	| { readonly kind: "discard_from"; readonly pile: DiscardPile; readonly count: ExprNode; readonly who?: string }
	| { readonly kind: "draw_from"; readonly pile: DrawPile; readonly count: ExprNode }
	// Dungeon
	| { readonly kind: "advance_dungeon_level"; readonly amount: ExprNode }
	// Misc
	| { readonly kind: "set_no_reward"; readonly to: string }
	// Composição
	| { readonly kind: "if"; readonly when: ConditionNode; readonly then: readonly EffectNode[]; readonly else?: readonly EffectNode[] }
	| { readonly kind: "choose_one"; readonly options: ReadonlyArray<{ readonly label: string; readonly effect: readonly EffectNode[] }> }
	| { readonly kind: "for_each"; readonly over: "targets" | "allies" | "enemies" | "all_heroes"; readonly as: string; readonly do: readonly EffectNode[] }
	| { readonly kind: "noop" };

// ── Trigger (forma objeto, substitui string) ─────────────────────────────────

export type LimitKind =
	| "once_per_game"
	| "once_per_combat"
	| "once_per_room"
	| "once_per_round";

/** Trigger no formato objeto pós-patch-12. */
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
	};

	// Ações — retornam novo GameState sem mutar o atual.
	// Todas passam pelo pipeline (pushEffect → EffectStack, addComponent → ECS).
	readonly action: {
		pushEffect(node: EffectNode): GameState;
		addComponent(entityId: string, component: Component): GameState;
		requestChoice(options: ReadonlyArray<{ readonly id: string; readonly label: string }>): GameState;
		log(msg: string): GameState;
	};

	/** Retorna novo EvalCtx com estado atualizado (para sequenciar efeitos). */
	readonly withState: (s: GameState) => EvalCtx;
}

import type { Component } from "../ecs/types";
import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";
import type { EffectNode } from "../skills/dsl/types";

export interface ScriptCtx {
	readonly state: GameState;
	/** Contexto legado do dispatcher — mantido para compat enquanto handlers antigos existem. */
	readonly skillCtx: SkillContext;

	// ── Campos de conveniência (extraídos de skillCtx) ──────────────────────
	readonly skillId: string;
	readonly params: Readonly<Record<string, unknown>>;
	readonly sourceId: string | null;
	readonly targetId: string | null;
	readonly targetIds: readonly string[];

	// ── Consultas de estado (puras, sem mutação) ────────────────────────────
	readonly query: {
		creatureHasSkill(enemyId: string, skillId: string): boolean;
		dungeonLevel(): number;
		roomEnemyCount(): number;
		// cresce sob demanda
	};

	// ── Ações (retornam novo GameState) ─────────────────────────────────────
	//
	// Regra inegociável (Passo 9): nenhuma ação muta state diretamente.
	// Tudo passa por pushEffect → EffectStack, addComponent → ECS, etc.
	readonly action: {
		/**
		 * Empurra um EffectNode para a EffectStack para drenagem posterior.
		 * Substitui mutações diretas como applyDamage(state, ...).
		 */
		pushEffect(node: EffectNode): GameState;

		/**
		 * Adiciona um componente a uma entidade no World ECS.
		 * Substitui mutações diretas em combat.bonusNextAttack, damageReduction, etc.
		 */
		addComponent(entityId: string, component: Component): GameState;

		/**
		 * Remove todos os componentes com `source === source` de uma entidade.
		 * Usado para limpar modifiers expirados/dispelled.
		 */
		removeComponentsBySource(entityId: string, source: string): GameState;

		/**
		 * Emite um evento no bus — stub para o Passo 7 do event bus.
		 */
		emit(event: { readonly type: string; readonly [k: string]: unknown }): GameState;

		/**
		 * Registra pendingSkillChoice e pausa a drenagem para input do jogador.
		 * `effect` em cada opção é o ramo DSL a avaliar quando escolhida (Lote 3+).
		 */
		requestChoice(options: ReadonlyArray<{
			readonly id: string;
			readonly label: string;
			readonly effect?: readonly import("../skills/dsl/types").EffectNode[];
		}>): GameState;

		/** Acrescenta mensagem ao eventLog. */
		log(msg: string): GameState;

		/**
		 * @deprecated use action.pushEffect({ kind: "apply_damage", to: targetId, amount })
		 * Mantido temporariamente enquanto scripts legados migram.
		 */
		dealDamage(targetId: string, amount: number): GameState;
	};

	/** Atalho para action.log (compat com scripts antigos). */
	readonly log: (msg: string) => GameState;

	/**
	 * Retorna novo ScriptCtx com estado atualizado.
	 * Usado pelo evaluator DSL para encadear efeitos.
	 */
	readonly withState: (s: GameState) => ScriptCtx;
}

export type ScriptHandler = (ctx: ScriptCtx) => GameState;

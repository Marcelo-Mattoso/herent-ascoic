// Tipos TypeScript para o catálogo de habilidades (skills.yaml).

export type SkillCategory =
	| "hero_skill"
	| "hero_power"
	| "monster_purple"
	| "item_skill"
	| "dungeon_skill"
	| "boss_skill";

export type SkillCardType =
	| "hero"
	| "creature"
	| "subboss"
	| "item"
	| "artifact"
	| "room";

/** @deprecated Lote B — use operate_type + trigger.event no lugar. Mantido para dispatch.ts legado. */
export type TriggerName = string;

/** @deprecated Lote C — substituído por target_type + affect_scope + affect_object + affect_limit */
export type TargetSpec = string;

export interface SkillDefinition {
	readonly id: string;
	readonly category: SkillCategory;
	// ── Ativação v2 (patch-21 Lote B) ─────────────────────────────
	/** Naturezas declarativas — sem efeito de motor em 21-D (resistências ficam para depois). */
	readonly nature?: readonly import("../skills/dsl/types").Nature[];
	readonly operate_type: import("../skills/dsl/types").OperateType;
	readonly trigger?: {
		readonly event: import("../skills/dsl/types").EventName;
	};
	readonly conditions?: readonly import("../skills/dsl/types").ConditionNode[];
	readonly cooldown?: import("../skills/dsl/types").CooldownNode;
	// ── Targeting v2 (patch-21 Lote C) ──────────────────────────────────
	readonly target_type: import("../skills/dsl/types").TargetType;
	readonly affect_scope: import("../skills/dsl/types").AffectScope;
	readonly affect_object: import("../skills/dsl/types").AffectObject;
	readonly affect_limit?: import("../skills/dsl/types").AffectLimit;
	// ── Campos pós-patch-12 ────────────────────────────────────────
	/** Array de EffectNode DSL. Exatamente um de effect/script deve estar presente. */
	readonly effect?: readonly import("../skills/dsl/types").EffectNode[];
	/** Nome do script em src/data/scripts/<script>.ts. */
	readonly script?: string;
	/** Params fixos da habilidade. Mesclados com SkillRef.params como $value. */
	readonly params?: Readonly<Record<string, unknown>>;
	/** Custo da habilidade — debitado antes de executar o efeito. */
	readonly cost?: {
		readonly hp?: number;
		readonly mp?: number;
		readonly discard?: number;
	};
}

export interface SkillCatalog {
	readonly version: string;
	readonly name: string;
	readonly game: string;
	readonly abilities: readonly SkillDefinition[];
}

// Contexto passado para handlers e dispatch.
// Campos opcionais — cada trigger preenche o que for relevante.
export interface SkillContext {
	readonly triggeredBy: string; // EventName | legacy string
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
	readonly targetHeroIds?: readonly string[];
	readonly targetEnemyIds?: readonly string[];
	readonly damageAmount?: number;
	readonly dieIndices?: readonly number[];
	readonly skillId?: string;
	readonly value?: number | string | null;
	// Flags contextuais
	readonly isFirstKillInRoom?: boolean;
	readonly isFirstDamageThisTurn?: boolean;
	readonly preyEnemyId?: string;
}

// Resultado do resolveTarget quando é necessário interação do jogador.
export type TargetResolution =
	| {
			kind: "resolved";
			heroIds?: string[];
			enemyIds?: string[];
			dieIndices?: number[];
	  }
	| { kind: "needs_selection"; candidates: TargetCandidate[] }
	| { kind: "none" };

export interface TargetCandidate {
	readonly kind: "hero" | "enemy" | "die";
	readonly id: string;
	readonly label: string;
	readonly dieIndex?: number;
}

// Tipos TypeScript para o catálogo de habilidades (skills.json).
// Schema derivado de docs/spec/v3/habilidades_1.json.

export type SkillCategory =
	| "habilidade"
	| "poder_heroi"
	| "efeito_roxo_monstro"
	| "habilidade_item"
	| "habilidade_dungeon"
	| "habilidade_chefe";

export type SkillCardType =
	| "hero"
	| "creature"
	| "subboss"
	| "item"
	| "artifact"
	| "room";

/** @deprecated Lote B — use operate_type + trigger.event no lugar. Mantido para dispatch.ts legado. */
export type TriggerName = string;

// Conjunto de targets reconhecidos pelo engine.
export type TargetSpec =
	// Personagens
	| "self"
	| "hero"
	| "heroes"
	| "hero_or_ally"
	| "hero_or_ally_creature"
	| "heroes_or_self_next_attack"
	| "creature_in_room"
	| "creature_in_play"
	| "another_creature_in_room"
	| "other_creature_in_same_room"
	| "another_creature_in_room"
	| "chosen_enemy"
	// Dados
	| "ally_die"
	| "ally_or_enemy_die"
	| "blue_die_and_self"
	| "die_with_value_1"
	// Recursos/zonas
	| "dungeon"
	| "group"
	| "item_deck"
	// Inimigos
	| "enemy"
	| "all_enemies"
	| "all_heroes"
	| "lowest_life_hero"
	| "target_hero"
	| "heroes_attacking_self"
	| "ally_or_next_attack"
	| "another_hero_or_self"
	| string; // fallback

export interface SkillDefinition {
	readonly id: string;
	readonly category: SkillCategory;
	// ── Ativação v2 (patch-21 Lote B) ─────────────────────────────
	readonly operate_type: import("../skills/dsl/types").OperateType;
	readonly trigger?: { readonly event: import("../skills/dsl/types").EventName };
	readonly conditions?: readonly import("../skills/dsl/types").ConditionNode[];
	readonly cooldown?: import("../skills/dsl/types").CooldownNode;
	readonly target: TargetSpec;
	readonly notes?: string;
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

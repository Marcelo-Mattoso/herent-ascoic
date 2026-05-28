// Tipos TypeScript para o catálogo de habilidades (skills.json).
// Schema derivado de docs/spec/v3/habilidades_1.json.

export type SkillCategory =
	| "habilidade"
	| "poder_heroi"
	| "efeito_roxo_monstro"
	| "habilidade_item"
	| "habilidade_dungeon"
	| "habilidade_chefe";

export type SkillCardType = "hero" | "creature" | "subboss" | "item" | "artifact" | "room";

export type SkillField = "skill" | "power" | "effect" | "purpleEffect";

// Conjunto de triggers reconhecidos pelo engine.
// Triggers compostos (once_per_X_...) são parseados por parseTrigger().
export type TriggerName =
	| "before_attack"
	| "after_roll"
	| "on_damage_taken"
	| "on_take_damage"
	| "on_take_attack_damage"
	| "on_hit_received"
	| "on_deal_damage"
	| "on_destroy_creature_with_attack"
	| "start_of_combat"
	| "on_enter_combat"
	| "before_combat"
	| "on_room_reveal"
	| "on_enter_room"
	| "first_round_in_room"
	| "on_win_room"
	| "on_first_creature_destroyed_in_room"
	| "on_use"
	| "while_equipped"
	| "while_in_play"
	| "while_active"
	| "on_enter_play"
	| "on_destroyed"
	| "once_per_room"
	| "once_per_combat"
	| "once_per_game"
	| "once_per_round_on_damage_taken"
	| "once_per_room_on_dungeon_discard"
	| "once_per_room_after_roll"
	| "once_per_room_on_targeted_by_effect"
	| "once_per_room_on_targeted"
	| "once_per_room_on_extra_dungeon_discard"
	| "once_per_game_until_end_of_round"
	| "once_per_game_after_any_roll"
	| "once_per_game_on_defeat_creature"
	| "once_per_game_after_roll_vs_prey"
	| "once_per_game_on_use_furia_rubra"
	| "combat_if_dungeon_red_or_purple"
	| "combat_if_alone_in_room"
	| "combat_if_another_creature_in_room"
	| "while_room_active"
	| "while_room_active_first_combat"
	| "first_roll_in_room"
	| "until_end_of_round"
	| "on_flee_or_leave_play"
	| "before_first_combat_in_room"
	| "first_hero_lose_combat_in_room"
	| "first_item_effect_received"
	| "on_first_target_chosen_in_room"
	| "on_reveal_paths"
	| "on_dungeon_discard"
	| "once_per_combat_instead_of_attack"
	| "on_purple_effect_damage_taken"
	| string; // fallback para triggers não catalogados ainda

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

export interface SkillUsage {
	readonly cardId: string;
	readonly cardType: SkillCardType;
	readonly field: SkillField;
	readonly value: number | string | null;
}

export interface SkillDefinition {
	readonly id: string;
	readonly name: string;
	readonly category: SkillCategory;
	readonly sourceSection?: string;
	readonly usesVariable: boolean;
	readonly defaultValue: number | string | null;
	readonly type: string;
	readonly trigger: TriggerName;
	readonly target: TargetSpec;
	readonly textTemplate: string;
	readonly labelTemplate: string;
	readonly notes?: string;
	readonly usedBy: readonly SkillUsage[];
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
	readonly triggeredBy: TriggerName;
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
	| { kind: "resolved"; heroIds?: string[]; enemyIds?: string[]; dieIndices?: number[] }
	| { kind: "needs_selection"; candidates: TargetCandidate[] }
	| { kind: "none" };

export interface TargetCandidate {
	readonly kind: "hero" | "enemy" | "die";
	readonly id: string;
	readonly label: string;
	readonly dieIndex?: number;
}

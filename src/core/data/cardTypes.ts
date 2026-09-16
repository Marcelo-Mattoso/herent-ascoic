// Tipos TypeScript que espelham o schema do cards.yaml.
// Cada variante é discriminada pelo campo `type`.

import type { AbilityGrant } from "./abilityTypes";

// --- Compartilhados ---

export type CardRewardType = "item" | "artifact";

// Dados de dado por cor: [branco, amarelo, laranja, vermelho, roxo]
export type DiceByColor = readonly [number, number, number, number, number];

// --- SkillRef ---

export interface SkillRef {
	readonly skillId: string;
	// Override dos params default da skill. Específico desta carta.
	readonly params?: Readonly<Record<string, number | string>>;
	// Só dispara com Despertar = 4. Substitui o slot "purpleEffect".
	readonly requiresAwakening?: boolean;
}

/** @deprecated Migração vNext: prefira grants[]. Mantido para cards.yaml atual. */
export type LegacySkillRef = SkillRef;

// --- Hero ---

export interface HeroCard {
	readonly type: "hero";
	readonly id: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- Creature ---

export interface CreatureCard {
	readonly type: "creature";
	readonly id: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- Subboss ---

export interface SubbossCard {
	readonly type: "subboss";
	readonly id: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- Room ---

export interface RoomCard {
	readonly type: "room";
	readonly id: string;
	readonly exits: number;
	// Número de inimigos por quantidade de jogadores: [1p, 2p, 3p, 4p]
	readonly enemiesByPlayers: readonly [number, number, number, number];
	readonly reward: number;
	readonly rewardType: CardRewardType;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
	readonly xp?: number;
	readonly specialCreatureId?: string;
}

// Sala especial que spawna um subchefe específico (injetada quando Despertar = 3).
export interface SubbossRoomCard {
	readonly type: "subboss_room";
	readonly id: string;
	readonly exits: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
	readonly xp?: number;
	readonly linkedSubbossId: string;
}

// --- Item ---

export type ItemClass =
	| "equipment"
	| "consumable"
	| "utility"
	| "special"
	| "charm";

export interface ItemCard {
	readonly type: "item";
	readonly id: string;
	readonly itemClass: ItemClass;
	readonly useTiming?: "pre_combat" | "damage_response";
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- Artifact ---

export interface ArtifactCard {
	readonly type: "artifact";
	readonly id: string;
	readonly countsAs: "artifact";
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- Boss ---

export interface BossCard {
	readonly type: "boss";
	readonly id: string;
	readonly lifeBase: number;
	readonly hitBonusBase: number;
	readonly damage: number;
	/** @deprecated Migração vNext: prefira grants[]. */
	readonly skills: readonly SkillRef[];
	readonly grants?: readonly AbilityGrant[];
}

// --- União discriminada ---

export type AnyCard =
	| HeroCard
	| CreatureCard
	| SubbossCard
	| RoomCard
	| SubbossRoomCard
	| ItemCard
	| ArtifactCard
	| BossCard;

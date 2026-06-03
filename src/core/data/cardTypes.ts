// Tipos TypeScript que espelham o schema do cards.yaml.
// Cada variante é discriminada pelo campo `type`.

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

// --- Hero ---

export interface HeroCard {
	readonly type: "hero";
	readonly id: string;
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly skills: readonly SkillRef[];
	readonly style: string;
}

// --- Creature ---

export interface CreatureCard {
	readonly type: "creature";
	readonly id: string;
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly skills: readonly SkillRef[];
}

// --- Subboss ---

export interface SubbossCard {
	readonly type: "subboss";
	readonly id: string;
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly skills: readonly SkillRef[];
}

// --- Room ---

export interface RoomCard {
	readonly type: "room";
	readonly id: string;
	readonly name: string;
	readonly exits: number;
	// Número de inimigos por quantidade de jogadores: [1p, 2p, 3p, 4p]
	readonly enemiesByPlayers: readonly [number, number, number, number];
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly skills: readonly SkillRef[];
	readonly xp?: number;
	readonly specialCreature?: string;
}

// Sala especial que spawna um subchefe específico (injetada quando Despertar = 3).
export interface SubbossRoomCard {
	readonly type: "subboss_room";
	readonly id: string;
	readonly name: string;
	readonly exits: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly skills: readonly SkillRef[];
	readonly xp?: number;
	readonly linkedSubbossName: string;
}

// --- Item ---

export type ItemClass = "equipment" | "consumable" | "utility" | "special";

export interface ItemCard {
	readonly type: "item";
	readonly id: string;
	readonly name: string;
	readonly itemClass: ItemClass;
	readonly tags: readonly string[];
	readonly skills: readonly SkillRef[];
}

// --- Artifact ---

export interface ArtifactCard {
	readonly type: "artifact";
	readonly id: string;
	readonly name: string;
	readonly countsAs: "artifact";
	readonly skills: readonly SkillRef[];
}

// --- Boss ---

export interface BossCard {
	readonly type: "boss";
	readonly id: string;
	readonly name: string;
	// Boss usa string descritiva em vez de diceByColor
	readonly dice: string;
	readonly lifeBase: number;
	readonly hitBonusBase: number;
	readonly damage: number;
	readonly condition: string;
	readonly artifactBonus: string;
	readonly dungeonScaling: string;
	readonly skills: readonly SkillRef[];
	readonly victory: string;
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

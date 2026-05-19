// Tipos TypeScript que espelham o schema do cards.json.
// Cada variante é discriminada pelo campo `type`.

// --- Compartilhados ---

export type CardRewardType = "item" | "artifact";

// Dados de dado por cor: [branco, amarelo, laranja, vermelho, roxo]
export type DiceByColor = readonly [number, number, number, number, number];

// --- Ability (v2) ---

export interface Ability {
	readonly name: string;
	readonly value: number | string | null;
	readonly type: string;
	readonly trigger: string;
	readonly target: string;
	readonly text: string;
	readonly label: string;
}

// --- Hero ---

export interface HeroCard {
	readonly type: "hero";
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly skill: Ability;
	readonly power: Ability;
	readonly style: string;
}

// --- Creature ---

export interface CreatureCard {
	readonly type: "creature";
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly effect: Ability;
	readonly purpleEffect: Ability;
}

// --- Subboss ---

export interface SubbossCard {
	readonly type: "subboss";
	readonly name: string;
	readonly diceByColor: DiceByColor;
	readonly life: readonly [number, number, number, number, number];
	readonly hitBonus: readonly [number, number, number, number, number];
	readonly damage: number;
	readonly xp: number;
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly effect: Ability;
	readonly purpleEffect: Ability;
}

// --- Room ---

export interface RoomCard {
	readonly type: "room";
	readonly name: string;
	readonly exits: number;
	// Número de inimigos por quantidade de jogadores: [1p, 2p, 3p, 4p]
	readonly enemiesByPlayers: readonly [number, number, number, number];
	readonly reward: number;
	readonly rewardType: CardRewardType;
	readonly effect: Ability;
	readonly xp?: number;
	readonly specialCreature?: string;
}

// --- Item ---

export type ItemClass = "equipment" | "consumable" | "utility" | "special";

export interface ItemCard {
	readonly type: "item";
	readonly name: string;
	readonly itemClass: ItemClass;
	readonly tags: readonly string[];
	readonly effect: Ability;
}

// --- Artifact ---

export interface ArtifactCard {
	readonly type: "artifact";
	readonly name: string;
	readonly countsAs: "artifact";
	readonly effect: Ability;
}

// --- Boss ---

export interface BossAbility {
	readonly name: string;
	readonly effect: Ability;
}

export interface BossCard {
	readonly type: "boss";
	readonly name: string;
	// Boss usa string descritiva em vez de diceByColor
	readonly dice: string;
	readonly lifeBase: number;
	readonly hitBonusBase: number;
	readonly damage: number;
	readonly condition: string;
	readonly artifactBonus: string;
	readonly dungeonScaling: string;
	readonly abilities: readonly BossAbility[];
	readonly victory: string;
}

// --- União discriminada ---

export type AnyCard =
	| HeroCard
	| CreatureCard
	| SubbossCard
	| RoomCard
	| ItemCard
	| ArtifactCard
	| BossCard;

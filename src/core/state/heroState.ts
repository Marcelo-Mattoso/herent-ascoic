// Registro de um herói na partida. Vida, atributos de combate e condições
// vivem no ECS (state.world); HeroState é a projeção calculada por access.ts.

export type ItemSlotType = "clothing1" | "clothing2" | "hand1" | "hand2" | "amulet";

export type HeroStatus = "active" | "defeated" | "fled";

export interface HeroRecord {
	readonly id: string;
	readonly cardId: string;
	// Slots de equipamentos ativos, indexados por tipo de slot
	readonly activeItems: Readonly<Partial<Record<ItemSlotType, string>>>;
	// Nomes de itens na mochila (sem slot equipado)
	readonly backpack: readonly string[];
	// Flags de poderes e habilidades já usados, com escopo ("room" | "combat" | "game")
	readonly usedPowers: Readonly<Record<string, boolean>>;
	status: HeroStatus;
	// Índice do jogador que controla este herói (0-based; em cooperativo todos são 0)
	readonly playerIndex: number;
	// XP individual acumulado por este herói (relevante no modo competitivo)
	xp: number;
}

export interface HeroStats {
	readonly maxLife: number;
	readonly currentLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	readonly conditions: readonly string[];
	// Bloqueia cura deste herói enquanto ativo (ex: Fumaça da Fornalha)
	readonly healBlocked?: boolean;
}

export type HeroState = HeroRecord & HeroStats;

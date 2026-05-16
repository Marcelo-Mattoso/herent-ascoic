// Estado de um herói durante a partida.
// Derivado da carta JSON no início do jogo e mutado pelo reducer ao longo das salas.

import type { ColorIndex } from "./color";

export type ItemSlotType = "weapon" | "armor" | "utility" | "special";

export type HeroStatus = "active" | "defeated" | "fled";

export interface HeroState {
	readonly id: string;
	readonly cardName: string;
	readonly maxLife: number;
	currentLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	impeto: ColorIndex;
	// Slots de equipamentos ativos, indexados por tipo de slot
	readonly activeItems: Readonly<Partial<Record<ItemSlotType, string>>>;
	// Nomes de itens na mochila (sem slot equipado)
	readonly backpack: readonly string[];
	// Flags de poderes e habilidades já usados, com escopo ("room" | "combat" | "game")
	readonly usedPowers: Readonly<Record<string, boolean>>;
	readonly conditions: readonly string[];
	status: HeroStatus;
}

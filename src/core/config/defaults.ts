// Valores configuráveis do jogo. Nenhum destes deve aparecer hardcoded em outro arquivo.

export const XP_COSTS = {
	recover_dungeon: 5,
	level_up: 10,
	buy_item: 15,
	lower_despertar: 30,
	buy_artifact: 35,
} as const;

export type XpSpendOption = keyof typeof XP_COSTS;

// Custo em XP para evitar derrota quando o deck de dungeon esgota
export const DUNGEON_EXHAUSTION_COST = 5;

export const FEATURE_FLAGS = {
	enableSubBosses: false,
	enableMultipleHeroes: false,
	enableSave: false,
} as const;

// Limite de cartas na mochila (null = ilimitada)
export const BACKPACK_LIMIT: number | null = null;

// Mapeamento de itemClass → slot de equipamento no HeroState
export const ITEM_CLASS_TO_SLOT = {
	equipment: "weapon",
	utility: "utility",
	special: "special",
	consumable: null,
} as const;

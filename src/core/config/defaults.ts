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

// Presets de dificuldade: deslocamento de cor aplicado ao Ímpeto inicial e ao Despertar inicial.
// heroOffset: quantas posições subir o Ímpeto de cada herói (0 = Branco).
// despertarOffset: quantas posições subir o Despertar da masmorra (0 = Branco).
export const DIFFICULTY_PRESETS = {
	very_easy: { heroOffset: 2, despertarOffset: 0 },
	easy: { heroOffset: 1, despertarOffset: 0 },
	normal: { heroOffset: 0, despertarOffset: 0 },
	hard: { heroOffset: 0, despertarOffset: 1 },
	nightmare: { heroOffset: 0, despertarOffset: 2 },
} as const;

export const FEATURE_FLAGS = {
	enableSubBosses: false,
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

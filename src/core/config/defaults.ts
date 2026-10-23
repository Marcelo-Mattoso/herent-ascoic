// Configuração de build e feature flags. Valores de balanceamento vivem em src/data/balance.json.

import BALANCE from "../../data/balance.json";

// Re-exporta os valores de balanceamento do JSON como constantes tipadas.
export const XP_COSTS = BALANCE.xpCosts as {
	recover_dungeon: number;
	level_up: number;
	buy_item: number;
	lower_despertar: number;
	buy_artifact: number;
};

export type XpSpendOption = keyof typeof XP_COSTS;

export const DUNGEON_EXHAUSTION_COST: number = BALANCE.dungeonExhaustionCost;

export const DIFFICULTY_PRESETS = BALANCE.difficultyPresets as {
	very_easy: { heroOffset: number; despertarOffset: number };
	easy: { heroOffset: number; despertarOffset: number };
	normal: { heroOffset: number; despertarOffset: number };
	hard: { heroOffset: number; despertarOffset: number };
	nightmare: { heroOffset: number; despertarOffset: number };
};

export const BACKPACK_LIMIT: number | null = BALANCE.backpackLimit;

// Feature flags e config de build — estes não vão para JSON.
export const FEATURE_FLAGS = {
	enableSubBosses: false,
	enableSave: false,
} as const;

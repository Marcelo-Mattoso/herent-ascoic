// Configuração de build e feature flags. Valores de balanceamento vivem em src/data/balance.json.

import BALANCE from "../../data/balance.json";

import type { Difficulty } from "../state/gameState";

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
export function getDungeonRecoveryCost(difficulty: Difficulty): number {
	return BALANCE.difficultyPresets[difficulty]?.recoverCost ?? DUNGEON_EXHAUSTION_COST;
}

export const DIFFICULTY_PRESETS = BALANCE.difficultyPresets as {
	very_easy: { heroOffset: number; despertarOffset: number; recoverCost: number };
	easy: { heroOffset: number; despertarOffset: number; recoverCost: number };
	normal: { heroOffset: number; despertarOffset: number; recoverCost: number };
	hard: { heroOffset: number; despertarOffset: number; recoverCost: number };
	nightmare: { heroOffset: number; despertarOffset: number; recoverCost: number };
};

export const BACKPACK_LIMIT: number | null = BALANCE.backpackLimit;

// Feature flags e config de build — estes não vão para JSON.
export const FEATURE_FLAGS = {
	enableSubBosses: false,
	enableSave: false,
} as const;

// Ao sair de alpha, altere stage para "release": o registro detalhado deixa
// de ser produzido e o painel oculto desaparece.
export { ALPHA_LOG_ENABLED, DIAGNOSTIC_LOG } from "../diagnostics/config";

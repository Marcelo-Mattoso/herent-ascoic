import type { GameBalance } from "@/core/gameEngine";

/** Hipótese restrita ao bot de leveling. Os custos oficiais permanecem inalterados. */
export const BOT_LEVELING_XP_EXPERIMENT: Partial<GameBalance["xpCosts"]> = {
	buy_item: 8,
	buy_artifact: 20,
};

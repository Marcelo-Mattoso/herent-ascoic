// Funções de fábrica para criar actions com tipagem correta.
// Wrappers finos — sem lógica.

import type { XpSpendOption } from "../config/defaults";
import type { GameConfig } from "../state/gameState";
import type { Action } from "./types";

export const startGame = (config: GameConfig): Action => ({
	type: "START_GAME",
	payload: config,
});

export const revealRoom = (): Action => ({ type: "REVEAL_ROOM" });
export const resolveRoomEffect = (): Action => ({
	type: "RESOLVE_ROOM_EFFECT",
});
export const spawnEnemies = (): Action => ({ type: "SPAWN_ENEMIES" });
export const startCombat = (): Action => ({ type: "START_COMBAT" });

export const chooseHero = (heroId: string): Action => ({
	type: "CHOOSE_HERO",
	payload: { heroId },
});

export const chooseTarget = (heroId: string, enemyId: string): Action => ({
	type: "CHOOSE_TARGET",
	payload: { heroId, enemyId },
});

export const rollDice = (): Action => ({ type: "ROLL_DICE" });
export const resolveAttack = (): Action => ({ type: "RESOLVE_ATTACK" });
export const checkCombatEnd = (): Action => ({ type: "CHECK_COMBAT_END" });
export const directDamage = (): Action => ({ type: "DIRECT_DAMAGE" });

export const useItem = (
	itemId: string,
	heroId: string,
	targetHeroId?: string,
	targetEnemyId?: string,
): Action => ({
	type: "USE_ITEM",
	payload: { itemId, heroId, targetHeroId, targetEnemyId },
});

export const usePower = (heroId: string): Action => ({
	type: "USE_POWER",
	payload: { heroId },
});

export const selectSkillTarget = (targetId: string): Action => ({
	type: "SELECT_SKILL_TARGET",
	payload: { targetId },
});

export const cancelSkillTarget = (): Action => ({
	type: "CANCEL_SKILL_TARGET",
});

export const grantRewards = (): Action => ({ type: "GRANT_REWARDS" });

export const gainXp = (amount: number): Action => ({
	type: "GAIN_XP",
	payload: { amount },
});

export const spendXp = (option: XpSpendOption, heroId?: string): Action => ({
	type: "SPEND_XP",
	payload: { option, heroId },
});

export const openPaths = (): Action => ({ type: "OPEN_PATHS" });

export const choosePath = (cardId: string): Action => ({
	type: "CHOOSE_PATH",
	payload: { cardId },
});

export const discardPaths = (): Action => ({ type: "DISCARD_PATHS" });
export const checkBossCondition = (): Action => ({
	type: "CHECK_BOSS_CONDITION",
});
export const revealBoss = (): Action => ({ type: "REVEAL_BOSS" });
export const startBossCombat = (): Action => ({ type: "START_BOSS_COMBAT" });
export const victory = (): Action => ({ type: "VICTORY" });

export const defeat = (reason: string): Action => ({
	type: "DEFEAT",
	payload: { reason },
});

export const skillChoice = (skillId: string, choice: string): Action => ({
	type: "SKILL_CHOICE",
	payload: { skillId, choice },
});

export const declareFlee = (heroId: string): Action => ({
	type: "DECLARE_FLEE",
	payload: { heroId },
});

export const restartDungeon = (keepEquipment: boolean): Action => ({
	type: "RESTART_DUNGEON",
	payload: { keepEquipment },
});

export const selectDie = (side: "hero" | "enemy", index: number): Action => ({
	type: "SELECT_DIE",
	payload: { side, index },
});

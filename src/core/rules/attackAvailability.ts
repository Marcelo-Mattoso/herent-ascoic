import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";

export function canStartHeroAttack(
	state: GameState,
	heroId: string,
	enemyId?: string,
): boolean {
	return (
		(state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") &&
		(state.combat?.phase === "selecting_hero" ||
			state.combat?.phase === "selecting_target") &&
		!state.paused &&
		!state.pendingSkillTarget &&
		!state.pendingSkillChoice &&
		!state.pendingTriggerInterrupt &&
		state.heroes.some(
			(hero) => hero.id === heroId && hero.status === "active",
		) &&
		!ActivationTracker.isHeroDisabledThisRound(state, heroId) &&
		state.activeEnemies.some(
			(enemy) =>
				enemy.status === "active" && (!enemyId || enemy.id === enemyId),
		)
	);
}

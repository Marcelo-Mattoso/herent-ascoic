import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { pausedOf, pendingSkillTargetOf, pendingSkillChoiceOf, pendingTriggerInterruptOf } from "../state/access";
import { gameOf } from "../../engine/state";

export function canStartHeroAttack(
	state: GameState,
	heroId: string,
	enemyId?: string,
): boolean {
	return (
		(gameOf(state).status === "HERO_ACTION" || gameOf(state).status === "BOSS_COMBAT") &&
		(gameOf(state).combat?.phase === "selecting_hero" ||
			gameOf(state).combat?.phase === "selecting_target") &&
		!pausedOf(state) &&
		!pendingSkillTargetOf(state) &&
		!pendingSkillChoiceOf(state) &&
		!pendingTriggerInterruptOf(state) &&
		gameOf(state).heroes.some(
			(hero) => hero.id === heroId && hero.status === "active",
		) &&
		!ActivationTracker.isHeroDisabledThisRound(state, heroId) &&
		gameOf(state).activeEnemies.some(
			(enemy) =>
				enemy.status === "active" && (!enemyId || enemy.id === enemyId),
		)
	);
}

// Sistema de condições — aplica e expira condições em entidades.
// Sincroniza com o ECS world.

import { syncEntityFromEnemy, syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

export function applyConditionToHero(
	state: GameState,
	heroId: EntityId,
	conditionType: string,
): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero || hero.conditions.includes(conditionType)) return state;
	const updated: HeroState = {
		...hero,
		conditions: [...hero.conditions, conditionType],
	};
	return {
		...state,
		heroes: state.heroes.map((h) => (h.id === heroId ? updated : h)),
		world: syncEntityFromHero(state.world, updated),
	};
}

export function removeConditionFromHero(
	state: GameState,
	heroId: EntityId,
	conditionType: string,
): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;
	const updated: HeroState = {
		...hero,
		conditions: hero.conditions.filter((c) => c !== conditionType),
	};
	return {
		...state,
		heroes: state.heroes.map((h) => (h.id === heroId ? updated : h)),
		world: syncEntityFromHero(state.world, updated),
	};
}

export function applyConditionToEnemy(
	state: GameState,
	enemyId: EntityId,
	conditionType: string,
): GameState {
	const enemy = state.activeEnemies.find((e) => e.id === enemyId);
	if (!enemy || enemy.conditions.includes(conditionType)) return state;
	const updated: EnemyState = {
		...enemy,
		conditions: [...enemy.conditions, conditionType],
	};
	return {
		...state,
		activeEnemies: state.activeEnemies.map((e) => (e.id === enemyId ? updated : e)),
		world: syncEntityFromEnemy(state.world, updated),
	};
}

export function removeConditionFromEnemy(
	state: GameState,
	enemyId: EntityId,
	conditionType: string,
): GameState {
	const enemy = state.activeEnemies.find((e) => e.id === enemyId);
	if (!enemy) return state;
	const updated: EnemyState = {
		...enemy,
		conditions: enemy.conditions.filter((c) => c !== conditionType),
	};
	return {
		...state,
		activeEnemies: state.activeEnemies.map((e) => (e.id === enemyId ? updated : e)),
		world: syncEntityFromEnemy(state.world, updated),
	};
}

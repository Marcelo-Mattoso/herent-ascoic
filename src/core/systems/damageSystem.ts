// Sistema de dano — ponto único para toda aplicação de dano no jogo.
// Atualiza tanto os arrays legados (heroes/enemies) quanto o ECS world.
// Passo 7 adicionará emissão de eventos pré/pós dano aqui.

import { syncEntityFromEnemy, syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

function applyDamageToTarget(
	state: GameState,
	targetId: EntityId,
	amount: number,
	minLife: number,
): GameState {
	const heroIdx = state.heroes.findIndex((h) => h.id === targetId);
	if (heroIdx >= 0) {
		const hero = state.heroes[heroIdx] as HeroState;
		const newLife = Math.max(minLife, hero.currentLife - amount);
		const updated: HeroState = {
			...hero,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : hero.status,
		};
		return {
			...state,
			heroes: state.heroes.map((h) => (h.id === targetId ? updated : h)),
			world: syncEntityFromHero(state.world, updated),
		};
	}

	const enemyIdx = state.activeEnemies.findIndex((e) => e.id === targetId);
	if (enemyIdx >= 0) {
		const enemy = state.activeEnemies[enemyIdx] as EnemyState;
		const newLife = Math.max(minLife, enemy.currentLife - amount);
		const updated: EnemyState = {
			...enemy,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : enemy.status,
		};
		return {
			...state,
			activeEnemies: state.activeEnemies.map((e) =>
				e.id === targetId ? updated : e,
			),
			world: syncEntityFromEnemy(state.world, updated),
		};
	}

	return state;
}

export function applyDamage(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	return applyDamageToTarget(state, targetId, amount, 0);
}

export function applyDamageMin1(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	return applyDamageToTarget(state, targetId, amount, 1);
}

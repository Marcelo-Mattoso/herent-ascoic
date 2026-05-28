// Sistema de cura — ponto único para toda aplicação de cura no jogo.
// Respeita healBlocked (ex: Fumaça da Fornalha).
// Passo 7 adicionará emissão de eventos pré/pós cura aqui.

import { syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

function findHero(state: GameState, targetId: EntityId): HeroState | undefined {
	return state.heroes.find((h) => h.id === targetId);
}

function replaceHero(state: GameState, updated: HeroState): GameState {
	return {
		...state,
		heroes: state.heroes.map((h) => (h.id === updated.id ? updated : h)),
		world: syncEntityFromHero(state.world, updated),
	};
}

export function applyHeal(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	const hero = findHero(state, targetId);
	if (!hero || hero.healBlocked) return state;
	const newLife = Math.min(hero.maxLife, hero.currentLife + amount);
	return replaceHero(state, { ...hero, currentLife: newLife });
}

export function applyFullHeal(state: GameState, targetId: EntityId): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	return replaceHero(state, { ...hero, currentLife: hero.maxLife, healBlocked: undefined });
}

export function applySurvive(
	state: GameState,
	targetId: EntityId,
): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const newLife = Math.max(1, hero.currentLife);
	return replaceHero(state, { ...hero, currentLife: newLife, status: "active" });
}

// Aplica ganho de vida sem verificar healBlocked (usado em progressão/level-up).
export function applyLifeGain(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const newLife = Math.min(hero.maxLife, hero.currentLife + amount);
	return replaceHero(state, { ...hero, currentLife: newLife });
}

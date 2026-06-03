// Sistema de cura — ponto único para toda aplicação de cura no jogo.
// Respeita healBlocked (ex: Fumaça da Fornalha).
// Passo 7: applyHeal emite HealAboutToBeApplied (pré) e HealApplied (pós).

import { syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import { emit } from "../events/bus";
import type { GameState } from "../state/gameState";
import { consumeOnceBlock } from "../state/blockHelpers";
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
	if (!hero) return state;
	if (hero.healBlocked) {
		// Consome bloco `once` para que a próxima cura passe (semântica "próxima cura").
		return consumeOnceBlock(state, `${targetId}::healBlocked`);
	}

	// Janela pré: listeners podem modificar a quantidade de cura.
	const { state: s1, event: modified } = emit(state, {
		type: "HealAboutToBeApplied",
		payload: { targetId, amount },
	});
	const finalAmount = (modified.payload as { amount: number }).amount;

	const newLife = Math.min(hero.maxLife, hero.currentLife + finalAmount);
	const s2 = replaceHero(s1, { ...hero, currentLife: newLife });

	// Janela pós: listeners reagem à cura aplicada.
	const { state: s3 } = emit(s2, {
		type: "HealApplied",
		payload: { targetId, amount: newLife - hero.currentLife },
	});

	return s3;
}

export function applyFullHeal(state: GameState, targetId: EntityId): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const s1 = replaceHero(state, {
		...hero,
		currentLife: hero.maxLife,
		healBlocked: undefined,
	});
	// Notifica pós — cura total, sem janela pré (é um reset de estado).
	const { state: s2 } = emit(s1, {
		type: "HealApplied",
		payload: { targetId, amount: hero.maxLife - hero.currentLife },
	});
	return s2;
}

export function applySurvive(state: GameState, targetId: EntityId): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const newLife = Math.max(1, hero.currentLife);
	return replaceHero(state, {
		...hero,
		currentLife: newLife,
		status: "active",
	});
}

// Aplica ganho de vida sem verificar healBlocked (usado em progressão/level-up).
// Sem janela de bus — é um ajuste de stats, não cura em jogo.
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

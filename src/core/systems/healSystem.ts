// Sistema de cura — ponto único para toda aplicação de cura no jogo.
// Respeita healBlocked (ex: Fumaça da Fornalha).
// Passo 7: applyHeal emite HealAboutToBeApplied (pré) e HealApplied (pós).

import type { EntityId } from "../ecs/types";
import { emit } from "../events/bus";
import {
	heroesOf,
	withHeroRecord,
	withUnitStats,
} from "../state/access";
import { consumeOnceBlock } from "../state/blockHelpers";
import type { GameState } from "../state/gameState";
import type { GameEngine } from "../gameEngine";

function findHero(state: GameState, targetId: EntityId) {
	return heroesOf(state).find((hero) => hero.id === targetId);
}

export function applyHeal(engine: GameEngine, 
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
	const { state: s1, event: modified } = emit(engine, state, {
		type: "HealAboutToBeApplied",
		payload: { targetId, amount },
	});
	const finalAmount = (modified.payload as { amount: number }).amount;

	const newLife = Math.min(hero.maxLife, hero.currentLife + finalAmount);
	const s2 = withUnitStats(s1, targetId, { currentLife: newLife });

	// Janela pós: listeners reagem à cura aplicada.
	const { state: s3 } = emit(engine, s2, {
		type: "HealApplied",
		payload: { targetId, amount: newLife - hero.currentLife },
	});

	return s3;
}

export function applyFullHeal(engine: GameEngine, state: GameState, targetId: EntityId): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const s1 = withUnitStats(state, targetId, {
		currentLife: hero.maxLife,
		healBlocked: false,
	});
	// Notifica pós — cura total, sem janela pré (é um reset de estado).
	const { state: s2 } = emit(engine, s1, {
		type: "HealApplied",
		payload: { targetId, amount: hero.maxLife - hero.currentLife },
	});
	return s2;
}

export function applySurvive(state: GameState, targetId: EntityId): GameState {
	const hero = findHero(state, targetId);
	if (!hero) return state;
	const revived = withUnitStats(state, targetId, {
		currentLife: Math.max(1, hero.currentLife),
	});
	return withHeroRecord(revived, targetId, (record) => ({
		...record,
		status: "active",
	}));
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
	return withUnitStats(state, targetId, { currentLife: newLife });
}

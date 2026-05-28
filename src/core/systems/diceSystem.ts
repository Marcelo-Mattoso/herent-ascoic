// Sistema de dados — interface para rolagem de ataque via ECS.
// Passo 6: thin wrapper que delega ao PRNG determinístico.
// Passo 7 adicionará modificadores de dados via event bus.

import { rollDiceRng } from "../rules/dice";
import type { DiceResult } from "../rules/dice";
import type { GameState } from "../state/gameState";
import type { RngState } from "../ports/random";

export interface AttackRollResult {
	readonly heroRoll: DiceResult;
	readonly enemyRoll: DiceResult;
	readonly rngAfter: RngState;
}

export function rollAttackDice(
	state: GameState,
	heroId: string,
	enemyId: string,
): { result: AttackRollResult; state: GameState } {
	const hero = state.heroes.find((h) => h.id === heroId);
	const enemy = state.activeEnemies.find((e) => e.id === enemyId);
	if (!hero || !enemy) {
		throw new Error(`[diceSystem] Herói ${heroId} ou inimigo ${enemyId} não encontrado`);
	}

	const { result: heroRoll, next: rng1 } = rollDiceRng(hero.dice, state.rng);
	const { result: enemyRoll, next: rng2 } = rollDiceRng(enemy.dice, rng1);

	return {
		result: { heroRoll, enemyRoll, rngAfter: rng2 },
		state: { ...state, rng: rng2 },
	};
}

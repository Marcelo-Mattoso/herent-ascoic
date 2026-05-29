// Rolagem de dados. Sem side effects — rng é injetável para testes determinísticos.

import type { RngState } from "../ports/random";
import { nextFloat } from "../ports/random";

export interface DiceResult {
	readonly results: readonly number[];
	readonly total: number;
}

// Versão determinística — usa RngState do GameState.
export function rollDiceRng(
	count: number,
	rng: RngState,
	faces = 6,
): { result: DiceResult; next: RngState } {
	const results: number[] = [];
	let currentRng = rng;
	for (let i = 0; i < count; i++) {
		const { value: f, next } = nextFloat(currentRng);
		results.push(Math.floor(f * faces) + 1);
		currentRng = next;
	}
	const result: DiceResult = {
		results,
		total: results.reduce((sum, n) => sum + n, 0),
	};
	return { result, next: currentRng };
}

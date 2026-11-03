// Rolagem de dados. Sem side effects — rng é injetável para testes determinísticos.

import type { RngState } from "../ports/random";
import { nextRoll } from "../ports/random";

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
		const { value, next } = nextRoll(currentRng, faces);
		results.push(value);
		currentRng = next;
	}
	const result: DiceResult = {
		results,
		total: results.reduce((sum, n) => sum + n, 0),
	};
	return { result, next: currentRng };
}

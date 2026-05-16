// Rolagem de dados. Sem side effects — rng é injetável para testes determinísticos.

export interface DiceResult {
	readonly results: readonly number[];
	readonly total: number;
}

// rng deve retornar valor em [0, 1) — default é Math.random
export function rollDice(
	count: number,
	faces = 6,
	rng: () => number = Math.random,
): DiceResult {
	const results: number[] = [];
	for (let i = 0; i < count; i++) {
		results.push(Math.floor(rng() * faces) + 1);
	}
	return {
		results,
		total: results.reduce((sum, n) => sum + n, 0),
	};
}

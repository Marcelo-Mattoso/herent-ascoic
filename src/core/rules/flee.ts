// Regra de fuga: o herói vence o confronto para fugir com sucesso.
export function isFleeAttemptWin(heroTotal: number, enemyTotal: number): boolean {
	return heroTotal > enemyTotal;
}

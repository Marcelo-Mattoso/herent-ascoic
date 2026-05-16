// Regra de escudo (manual 8.4.1).
// Aplica-se apenas ao primeiro dano sofrido pelo alvo no turno corrente.
// Dano 1 ou 2 → reduzido a 0. Dano maior → reduzido em 2.

export function applyShield(
	damage: number,
	isFirstDamageThisTurn: boolean,
	hasShield: boolean,
): number {
	if (!hasShield || !isFirstDamageThisTurn) return damage;
	if (damage <= 2) return 0;
	return damage - 2;
}

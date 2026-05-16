// Cálculos de combate puros. Recebem valores escalares, retornam resultado sem mutar nada.

export interface BonusEntry {
	readonly source: string;
	readonly value: number;
}

export interface AttackTotal {
	readonly dice: number;
	readonly bonus: number;
	readonly total: number;
	readonly breakdown: readonly BonusEntry[];
}

export type AttackOutcome = "hero_wins" | "enemy_wins" | "tie";

export interface AttackResult {
	readonly heroDamageTaken: number;
	readonly enemyDamageTaken: number;
	readonly outcome: AttackOutcome;
}

// Soma dados e aplica bônus discriminados por fonte
export function calculateTotal(
	diceResults: readonly number[],
	bonuses: readonly BonusEntry[],
): AttackTotal {
	const dice = diceResults.reduce((sum, n) => sum + n, 0);
	const bonus = bonuses.reduce((sum, b) => sum + b.value, 0);
	return { dice, bonus, total: dice + bonus, breakdown: bonuses };
}

// Resolve um par de totais e retorna quanto dano cada lado sofre.
// Empate (manual 8.3): ambos sofrem 1 de dano.
export function resolveAttack(
	heroTotal: number,
	enemyTotal: number,
	heroDamage: number,
	enemyDamage: number,
): AttackResult {
	if (heroTotal > enemyTotal) {
		return {
			heroDamageTaken: 0,
			enemyDamageTaken: heroDamage,
			outcome: "hero_wins",
		};
	}
	if (enemyTotal > heroTotal) {
		return {
			heroDamageTaken: enemyDamage,
			enemyDamageTaken: 0,
			outcome: "enemy_wins",
		};
	}
	// Empate
	return { heroDamageTaken: 1, enemyDamageTaken: 1, outcome: "tie" };
}

/** Decisões reproduzíveis de tuning e validação, sem acesso ao motor. */
export interface BonusTrial {
  readonly bonus: number;
  readonly wins: number;
  readonly violations: number;
}
/**
 * Otimização só no treino: prioriza vitórias, menos violações e
 * o menor bônus como desempate, evitando overfitting por força bruta.
 */
export function selectBonus(samples: readonly BonusTrial[]): number {
  if (!samples.length) throw new Error("Amostras de ajuste ausentes");
  const sorted = [...samples].sort((a, b) =>
    b.wins - a.wins || a.violations - b.violations || a.bonus - b.bonus);
  return sorted[0]!.bonus;
}
export function mcnemarStatistic(improvedOnly: number, baselineOnly: number): number {
  if (![improvedOnly, baselineOnly].every(n => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Discordâncias pareadas inválidas");
  const discordant = improvedOnly + baselineOnly;
  if (!discordant) return 0;
  return Math.max(0, Math.abs(improvedOnly - baselineOnly) - 1) ** 2 / discordant;
}

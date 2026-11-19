/**
 * Intervalo Wilson de 95% para frequências de itens observados.
 * NUNCA interpreta correlação por herói como alteração causal do baralho.
 */
export interface DropFrequency {
  readonly observations: number;
  readonly trials: number;
  readonly frequency: number | null;
  readonly confidence95: readonly [number, number] | null;
}
export function observedFrequency(observations: number, trials: number): DropFrequency {
  if (!Number.isSafeInteger(observations) || !Number.isSafeInteger(trials) ||
    observations < 0 || trials < 0 || observations > trials)
    throw new Error("Contagens inválidas para frequência de item");
  if (!trials) return { observations, trials, frequency: null, confidence95: null };
  const z = 1.96;
  const p = observations / trials;
  const denominator = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator;
  return { observations, trials, frequency: p, confidence95: [
    Math.max(0, center - half), Math.min(1, center + half),
  ] };
}

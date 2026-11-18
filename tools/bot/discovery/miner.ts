/** Frequência e contexto das sequências. Associação não prova causalidade. */
export interface PatternObservation {
  readonly pairs: readonly string[];
  readonly won: boolean;
  readonly context: string;
}
export interface PatternCandidate {
  readonly pattern: readonly string[];
  readonly support: number;
  readonly wins: number;
  readonly contexts: readonly string[];
  readonly lift: number;
}
export const patternKey = (pattern: readonly string[]): string => pattern.join(" -> ");
export function minePatterns(observations: readonly PatternObservation[], minSupport = 3): PatternCandidate[] {
  const baseline = observations.length ? observations.filter(x => x.won).length / observations.length : 0;
  const counts = new Map<string, { support: number; wins: number; contexts: Set<string> }>();
  for (const game of observations) for (const pair of new Set(game.pairs)) {
    const row = counts.get(pair) ?? { support: 0, wins: 0, contexts: new Set<string>() };
    row.support++;
    if (game.won) row.wins++;
    row.contexts.add(game.context);
    counts.set(pair, row);
  }
  return [...counts.entries()].filter(([, row]) => row.support >= minSupport)
    .map(([key, row]) => ({ pattern: key.split(" -> "), support: row.support,
      wins: row.wins, contexts: [...row.contexts].sort(), lift: row.wins / row.support - baseline }))
    .sort((a, b) => b.lift - a.lift || b.support - a.support || patternKey(a.pattern).localeCompare(patternKey(b.pattern)));
}

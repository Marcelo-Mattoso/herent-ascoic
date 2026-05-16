// Strategy: desempate quando múltiplos heróis têm a mesma vida mínima.
// Default: menor % de vida; se igual, primeiro no array.

import type { HeroState } from "../state/heroState";

export function tiebreakHero(candidates: readonly HeroState[]): HeroState {
	return candidates.reduce((best, h) => {
		const bestPct = best.currentLife / best.maxLife;
		const hPct = h.currentLife / h.maxLife;
		return hPct < bestPct ? h : best;
	});
}

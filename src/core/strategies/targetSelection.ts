// Strategy: qual herói o inimigo ataca quando causa dano direto.
// Default: herói ativo com menor vida atual.

import type { HeroState } from "../state/heroState";

export function selectTargetHero(
	heroes: readonly HeroState[],
): HeroState | null {
	const active = heroes.filter((h) => h.status === "active");
	if (active.length === 0) return null;
	return active.reduce((min, h) => (h.currentLife < min.currentLife ? h : min));
}

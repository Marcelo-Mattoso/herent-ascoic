// heal_or_survive: Milagre Maior da Última Luz (Clérigo power).
// Escolha: cura totalmente 1 herói OU impede que ele seja destruído (deixa com 1 de vida).
// value = "full/1" — "full" = cura total, "1" = sobrevivência mínima.
// Escolha do jogador: via ctx.targetHeroIds + ctx.value === "full" ou "survive".

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log, mapHero } from "../../reducer/utils";

export function handleHealOrSurvive(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	const targetId = ctx.targetHeroIds?.[0] ?? ctx.sourceHeroId;
	if (!targetId) return state;

	const hero = state.heroes.find((h) => h.id === targetId);
	if (!hero) return state;

	const choice = typeof ctx.value === "string" ? ctx.value : "full";

	if (choice === "survive") {
		// Impede destruição: deixa com 1 de vida
		return log(
			mapHero(state, targetId, (h) => ({
				...h,
				currentLife: Math.max(1, h.currentLife),
				status: "active" as const,
			})),
			`Clérigo: Milagre — ${hero.cardName} sobrevive com 1 de vida.`,
		);
	}

	// Cura total
	return log(
		mapHero(state, targetId, (h) => ({ ...h, currentLife: h.maxLife })),
		`Clérigo: Milagre — ${hero.cardName} curado totalmente.`,
	);
}

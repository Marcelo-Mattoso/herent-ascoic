// heal_or_survive: Milagre Maior da Última Luz (Clérigo power).
// Escolha: cura totalmente 1 herói OU impede que ele seja destruído (deixa com 1 de vida).
// value = "full/1" — "full" = cura total, "1" = sobrevivência mínima.
// Escolha do jogador: via ctx.targetHeroIds + ctx.value === "full" ou "survive".

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { applyFullHeal, applySurvive } from "../../systems/healSystem";
import { log } from "../../reducer/utils";

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

	if (hero.healBlocked && choice !== "survive") {
		return log(state, `${hero.cardName}: cura bloqueada (Fumaça da Fornalha).`);
	}

	if (choice === "survive") {
		// Impede destruição: deixa com 1 de vida
		return log(
			applySurvive(state, targetId),
			`Clérigo: Milagre — ${hero.cardName} sobrevive com 1 de vida.`,
		);
	}

	// Cura total
	return log(
		applyFullHeal(state, targetId),
		`Clérigo: Milagre — ${hero.cardName} curado totalmente.`,
	);
}

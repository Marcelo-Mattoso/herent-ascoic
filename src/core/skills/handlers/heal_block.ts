// heal_block: bloqueia cura de heróis-alvo enquanto ativo.
// Cobre: habilidade-fumaca-da-fornalha.
// Verificado no início de handleHeal, handleHealOrSurvive, handleHealOrDamageBonus.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log, mapHero } from "../../reducer/utils";

export function handleHealBlock(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	const targets: string[] = ctx.targetHeroIds?.length
		? [...ctx.targetHeroIds]
		: ctx.sourceHeroId
			? [ctx.sourceHeroId]
			: state.heroes.filter((h) => h.status === "active").map((h) => h.id);

	if (targets.length === 0) return state;

	let next = state;
	for (const heroId of targets) {
		next = mapHero(next, heroId, (h) => ({ ...h, healBlocked: true }));
	}
	return log(next, `Cura bloqueada para: ${targets.join(", ")}.`);
}

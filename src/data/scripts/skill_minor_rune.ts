import type { ScriptHandler } from "@/core/scripts/types";

// skill_minor_rune — Runa Menor (Cajado das Runas Rubras)
// Uma vez por sala, depois de rolar, rerrola 1 dado aliado que tenha valor 1.
export const run: ScriptHandler = (ctx) => {
	const { state, skillCtx } = ctx;
	if (!state.combat?.lastRoll || !skillCtx.sourceHeroId || !skillCtx.skillId) return state;
	const roll = state.combat.lastRoll;
	const eligibleHero = roll.heroResults.some((v) => v === 1);
	if (!eligibleHero) return ctx.action.log("Nenhum dado com valor 1 para rerolar.");
	return {
		...state,
		combat: {
			...state.combat,
			pendingDiceSelection: {
				skillId: skillCtx.skillId,
				heroId: skillCtx.sourceHeroId,
				side: "hero" as const,
				filter: { value: 1 },
				action: "reroll" as const,
			},
		},
	};
};

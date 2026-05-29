import type { ScriptHandler } from "@/core/scripts/types";

// skill_perfect_rune — Runa Perfeita
// Uma vez por sala, depois de rolar, transforma 1 dado aliado em 6.
export const run: ScriptHandler = (ctx) => {
	const { state, skillCtx } = ctx;
	if (!state.combat?.lastRoll || !skillCtx.sourceHeroId || !skillCtx.skillId)
		return state;
	return {
		...state,
		combat: {
			...state.combat,
			pendingDiceSelection: {
				skillId: skillCtx.skillId,
				heroId: skillCtx.sourceHeroId,
				side: "any" as const,
				action: "set_to" as const,
				setToValue: 6,
			},
		},
	};
};

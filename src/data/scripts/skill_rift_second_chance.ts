import type { ScriptHandler } from "@/core/scripts/types";

// skill_rift_second_chance — Segunda Chance das Fendas
// FIX: handler anterior filtrava apenas dados com valor=1 (igual a skill_minor_rune).
// Esta skill deve rerolar QUALQUER dado aliado, sem restrição de valor.
// Trigger: once_per_combat. Configura pendingDiceSelection.
export const run: ScriptHandler = (ctx) => {
	const { state, skillCtx } = ctx;
	if (!state.combat?.lastRoll || !skillCtx.sourceHeroId || !skillCtx.skillId) {
		return state;
	}
	// Permite rerolar qualquer dado aliado (sem filtro de valor)
	return {
		...state,
		combat: {
			...state.combat,
			pendingDiceSelection: {
				skillId: skillCtx.skillId,
				heroId: skillCtx.sourceHeroId,
				side: "hero" as const,
				action: "reroll" as const,
			},
		},
	};
};

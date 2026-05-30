import type { ScriptHandler } from "@/core/scripts/types";

// skill_rift_rune — Runa das Fendas
// Depois de rolar, abre seleção interativa de dado aliado para o jogador modificar.
// O valor máximo de modificação é params.value.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.state.combat?.lastRoll || !ctx.sourceId || !ctx.skillId)
		return ctx.state;
	const hero = ctx.state.heroes.find((h) => h.id === ctx.sourceId);
	if (!hero) return ctx.state;
	const value =
		typeof ctx.params.value === "number" ? ctx.params.value : 1;
	return {
		...ctx.state,
		combat: {
			...ctx.state.combat,
			pendingDiceSelection: {
				skillId: ctx.skillId,
				heroId: ctx.sourceId,
				side: "hero" as const,
				action: "reroll" as const,
				filter: { minValue: 1 },
			},
		},
		eventLog: [
			...ctx.state.eventLog,
			`${hero.cardName}: Runa das Fendas — altere 1 dado aliado em até ${value}.`,
		],
	};
};

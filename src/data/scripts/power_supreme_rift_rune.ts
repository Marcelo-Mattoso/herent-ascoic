import type { ScriptHandler } from "@/core/scripts/types";

// power_supreme_rift_rune — Runa Suprema das Fendas
// Uma vez por jogo, depois de qualquer rolagem: transforme 1 dado aliado em 6
// (ou inimigo em 1). Abre pendingDiceSelection com set_to: 6, side: "any".
export const run: ScriptHandler = (ctx) => {
	if (!ctx.state.combat?.lastRoll || !ctx.sourceId || !ctx.skillId)
		return ctx.state;
	const hero = ctx.state.heroes.find((h) => h.id === ctx.sourceId);
	if (!hero) return ctx.state;
	return {
		...ctx.state,
		combat: {
			...ctx.state.combat,
			pendingDiceSelection: {
				skillId: ctx.skillId,
				heroId: ctx.sourceId,
				side: "any" as const,
				action: "set_to" as const,
				setToValue: 6,
			},
		},
		eventLog: [
			...ctx.state.eventLog,
			`${hero.cardName}: Runa Suprema — escolha 1 dado aliado → 6 ou inimigo → 1.`,
		],
	};
};

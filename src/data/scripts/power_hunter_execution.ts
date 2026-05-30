import type { ScriptHandler } from "@/core/scripts/types";

// power_hunter_execution — Execução do Caçador
// Uma vez por jogo, depois de rolar contra a Presa: transforme 1 dado azul em 6
// e cause +1 de dano se acertar.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.state.combat?.lastRoll || !ctx.sourceId || !ctx.skillId)
		return ctx.state;
	const hero = ctx.state.heroes.find((h) => h.id === ctx.sourceId);
	if (!hero) return ctx.state;

	// Verificar se o combate atual é contra a Presa
	const prey = ctx.state.combat.prey;
	const fightingPrey =
		prey &&
		ctx.state.combat.pairs.some(
			(p) => p.heroId === ctx.sourceId && p.enemyId === prey,
		);
	if (!fightingPrey) return ctx.state;

	// +1 bônus de dano + pendingDiceSelection para transformar dado azul em 6
	const prevBonuses = ctx.state.combat.bonusNextAttack[ctx.sourceId] ?? [];
	return {
		...ctx.state,
		combat: {
			...ctx.state.combat,
			bonusNextAttack: {
				...ctx.state.combat.bonusNextAttack,
				[ctx.sourceId]: [
					...prevBonuses,
					{ label: "Execução do Caçador", value: 1 },
				],
			},
			pendingDiceSelection: {
				skillId: ctx.skillId,
				heroId: ctx.sourceId,
				side: "hero" as const,
				action: "set_to" as const,
				setToValue: 6,
			},
		},
		eventLog: [
			...ctx.state.eventLog,
			`${hero.cardName}: Execução do Caçador — dado azul → 6, +1 dano contra Presa.`,
		],
	};
};

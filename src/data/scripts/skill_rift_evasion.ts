import type { ScriptHandler } from "@/core/scripts/types";

// skill_rift_evasion — Evasão das Fendas
// Esta criatura ignora o primeiro efeito de item usado contra ela neste combate.
// Porta exata de handleItemControl.
export const run: ScriptHandler = (ctx) => {
	const enemyId = ctx.skillCtx.sourceEnemyId;
	if (!enemyId || !ctx.state.combat) return ctx.state;

	// Usa oncePer.combat para garantir que só bloqueia uma vez por combate
	const key = `itemControl::${enemyId}`;
	if (ctx.state.combat.oncePer.combat[key]) return ctx.state;

	return {
		...ctx.state,
		combat: {
			...ctx.state.combat,
			itemControlByEnemy: {
				...ctx.state.combat.itemControlByEnemy,
				[enemyId]: true,
			},
			oncePer: {
				...ctx.state.combat.oncePer,
				combat: { ...ctx.state.combat.oncePer.combat, [key]: true },
			},
		},
		eventLog: [
			...ctx.state.eventLog,
			`${enemyId}: Evasão das Fendas ativa — próximo item bloqueado.`,
		],
	};
};

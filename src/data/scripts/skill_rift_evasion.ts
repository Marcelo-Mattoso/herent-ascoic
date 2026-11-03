import type { ScriptHandler } from "@/core/scripts/types";
import { scopedFlagOf, withScopedFlag } from "@/core/state/access";
import { gameOf, withGame } from "../../engine/state";

// skill_rift_evasion — Evasão das Fendas
// Esta criatura ignora o primeiro efeito de item usado contra ela neste combate.
// Porta exata de handleItemControl.
export const run: ScriptHandler = (ctx) => {
	const enemyId = ctx.skillCtx.sourceEnemyId;
	if (!enemyId || !gameOf(ctx.state).combat) return ctx.state;

	// Usa oncePer.combat para garantir que só bloqueia uma vez por combate
	const key = `itemControl::${enemyId}`;
	if (scopedFlagOf(ctx.state, "combat", "oncePer", key)) return ctx.state;

	const marked = withScopedFlag(
		withScopedFlag(ctx.state, "combat", "itemControl", enemyId),
		"combat",
		"oncePer",
		key,
	);
	return withGame(marked, (prevGame) => ({ ...prevGame, eventLog: [
			...gameOf(ctx.state).eventLog,
			`${enemyId}: Evasão das Fendas ativa — próximo item bloqueado.`,
		] }));
};

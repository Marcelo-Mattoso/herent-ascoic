import type { ScriptHandler } from "@/core/scripts/types";

// skill_living_ember_oil — Brasa Viva (Frasco de Óleo Incendiário)
// Causa 2 de dano direto a uma criatura em jogo.
// Se a criatura tiver Corpo Gelatinoso (skill_gelatinous_body), causa 3 em vez de 2.
// Migrada no patch-10, portada para nova convenção (script field) no patch-12.
export const run: ScriptHandler = (ctx) => {
	const enemyId = ctx.skillCtx.targetEnemyIds?.[0];
	if (!enemyId) return ctx.state;

	const hasGelatinous = ctx.query.creatureHasSkill(
		enemyId,
		"skill_gelatinous_body",
	);
	const amount = hasGelatinous ? 3 : 2;

	return ctx.action.pushEffect({ kind: "apply_damage", to: enemyId, amount });
};

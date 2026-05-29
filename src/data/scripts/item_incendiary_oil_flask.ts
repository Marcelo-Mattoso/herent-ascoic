import type { ScriptHandler } from "@/core/scripts/types";

// Frasco de Óleo Incendiário — Brasa Viva (2/3)
// Causa 2 de dano direto a uma criatura em jogo.
// Se a criatura tiver Corpo Gelatinoso (skill_gelatinous_body), causa 3 em vez de 2.
export const livingEmber: ScriptHandler = (ctx) => {
	const { state, skillCtx, query, action } = ctx;

	const enemyId = skillCtx.targetEnemyIds?.[0];
	if (!enemyId) return state;

	const hasGelatinous = query.creatureHasSkill(
		enemyId,
		"skill_gelatinous_body",
	);
	const amount = hasGelatinous ? 3 : 2;

	return action.dealDamage(enemyId, amount);
};

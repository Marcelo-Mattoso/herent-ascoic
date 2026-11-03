import type { ScriptHandler } from "@/core/scripts/types";
import { enemiesOf, heroesOf } from "@/core/state/access";

// skill_opportunity_shot — Tiro de Oportunidade
// Uma vez por combate, ao invés de combater, cause o dano base do herói
// diretamente à criatura alvo.
export const run: ScriptHandler = (ctx) => {
	const heroId = ctx.sourceId;
	const enemyId = ctx.targetId;
	if (!heroId || !enemyId) return ctx.state;

	const hero = heroesOf(ctx.state).find((h) => h.id === heroId);
	if (!hero || hero.status !== "active") return ctx.state;

	const enemy = enemiesOf(ctx.state).find((e) => e.id === enemyId);
	if (!enemy || enemy.status !== "active") return ctx.state;

	return ctx.action.pushEffect({
		kind: "i_damage",
		to: enemyId,
		amount: hero.damage,
	});
};

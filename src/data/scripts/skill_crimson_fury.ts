import type { ScriptHandler } from "@/core/scripts/types";

// skill_crimson_fury — Fúria Rubra
// O herói paga `value` de vida para causar dano adicional igual a 3x o valor no próximo ataque.
// Trigger: before_attack. $source = herói portador.
export const run: ScriptHandler = (ctx) => {
	const cost = (ctx.params.value as number) ?? 0;
	if (!cost || cost <= 0) return ctx.state;
	if (!ctx.sourceId) return ctx.state;

	const hero = ctx.state.heroes.find((h) => h.id === ctx.sourceId);
	if (!hero || hero.status !== "active") return ctx.state;

	const bonus = cost * 3;

	// Pagar custo em vida (sem matar — applyDamageMin1 semântica via minimum no effect)
	let state = ctx.action.pushEffect({
		kind: "apply_damage",
		to: ctx.sourceId,
		amount: cost,
		minimum: 1,
	});
	// Registrar bônus de dano para o próximo ataque
	const ctx2 = ctx.withState(state);
	state = ctx2.action.pushEffect({
		kind: "add_modifier",
		to: ctx.sourceId,
		stat: "damage_bonus",
		operation: "add",
		value: bonus,
		duration: { kind: "once" },
	});

	return state;
};

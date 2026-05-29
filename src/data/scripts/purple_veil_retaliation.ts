import type { ScriptHandler } from "@/core/scripts/types";

// purple_veil_retaliation — Retaliação do Véu
// FIX CRÍTICO: tipo "damage_reflect" nunca foi registrado → efeito nunca disparava.
// Sempre que esta criatura for acertada por um herói, esse herói sofre {value} de dano.
// Trigger: on_hit_received. $source = criatura. $target = herói que acertou.
export const run: ScriptHandler = (ctx) => {
	const attackerId = ctx.targetId;
	if (!attackerId) return ctx.state;
	const amount = (ctx.params.value as number) ?? 1;
	return ctx.action.pushEffect({
		kind: "apply_damage",
		to: attackerId,
		amount,
	});
};

import type { ScriptHandler } from "@/core/scripts/types";

// purple_ember_blood — Sangue em Brasa
// FIX CRÍTICO: tipo "damage_reflect" nunca foi registrado → efeito nunca disparava.
// Sempre que esta criatura sofrer dano, o herói que causou esse dano sofre 1 de dano direto.
// Trigger: on_take_damage. $source = criatura com o efeito. $target = herói atacante.
export const run: ScriptHandler = (ctx) => {
	const attackerId = ctx.targetId; // herói que causou o dano (targetId no contexto de dano recebido)
	if (!attackerId) return ctx.state;
	return ctx.action.pushEffect({
		kind: "apply_damage",
		to: attackerId,
		amount: 1,
	});
};

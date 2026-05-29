import type { ScriptHandler } from "@/core/scripts/types";

// skill_hunter_focus — Foco do Caçador
// Enquanto este item estiver equipado, herói recebe +{value} no Bônus de Acerto.
// Trigger: while_equipped / combat (passivo coletado via collectHeroBonuses).
// O handler antigo era noop (handleTohit retornava state inalterado).
// Este script registra o bônus no bonusNextAttack para o herói portador.
export const run: ScriptHandler = (ctx) => {
	const bonus = (ctx.params.value as number) ?? 0;
	if (!bonus || !ctx.sourceId || !ctx.state.combat) return ctx.state;
	return ctx.action.pushEffect({
		kind: "add_modifier",
		to: ctx.sourceId,
		stat: "tohit_bonus",
		operation: "add",
		value: bonus,
		duration: { kind: "once" },
	});
};

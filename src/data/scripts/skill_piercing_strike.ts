import type { ScriptHandler } from "@/core/scripts/types";

// skill_piercing_strike — Golpe Trespassante
// Quando destruir uma criatura com um ataque, causa 1 de dano direto a outra criatura da mesma sala.
// FIX: tipo antigo era "direct_damage" mas o handler correto é splash (outra criatura, não o alvo atual).
// Trigger: on_destroy_creature_with_attack. $source = inimigo destruído (ctx.sourceEnemyId).
export const run: ScriptHandler = (ctx) => {
	// Encontra outra criatura ativa (excluindo a que foi destruída)
	const others = ctx.state.activeEnemies.filter(
		(e) => e.status === "active" && e.id !== ctx.sourceId,
	);
	if (others.length === 0) return ctx.state;

	// Alvo: criatura com menor vida entre as restantes
	const target = others.reduce((a, b) =>
		a.currentLife <= b.currentLife ? a : b,
	);
	return ctx.action.pushEffect({
		kind: "i_damage",
		to: target.id,
		amount: 1,
	});
};

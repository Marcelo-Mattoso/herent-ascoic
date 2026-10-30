import { getCardName } from "@/core/data/cardLocale";
import type { ModifierComponent } from "@/core/ecs/types";
import { addComponent } from "@/core/ecs/world";
import { log } from "@/core/reducer/utils";
import type { ScriptHandler, SkillContinuation } from "@/core/scripts/types";

import { withWorld, worldOf } from "@/core/state/access";
import { withPendingSkillChoice } from "../../core/state/access";
import { gameOf, withGame } from "../../engine/state";
// skill_focus_deflection — Desvio de Foco
// Uma vez por sala, quando escolhido como alvo: redireciona para outro herói
// voluntário, ou aceita e ganha +2 no total de acerto.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.skillId) return ctx.state;

	const tohitBonus =
		typeof ctx.params.value === "number" ? ctx.params.value : 2;
	const otherHeroes = gameOf(ctx.state).heroes.filter(
		(h) => h.status === "active" && h.id !== ctx.sourceId,
	);

	const options: { id: string; label: string }[] = [
		{
			id: "tohit",
			label: `Aceitar e ganhar +${tohitBonus} de acerto neste ataque`,
		},
	];
	if (otherHeroes.length > 0) {
		options.unshift({
			id: `redirect:${otherHeroes[0]!.id}`,
			label: `Redirecionar para ${getCardName(otherHeroes[0]!.cardId)}`,
		});
	}

	return withPendingSkillChoice(ctx.state, {
			skillId: ctx.skillId,
			prompt:
				"Desvio de Foco: você foi escolhido como alvo. Como deseja responder?",
			options,
			sourceHeroId: ctx.sourceId,
		});
};

// Continuação registrada por skillId (Patch-16 Lote C)
export const continuation: SkillContinuation = (
	state,
	ctx,
	choice,
) => {
	if (!ctx.sourceHeroId || !gameOf(state).combat) return state;

	if (choice.startsWith("redirect:")) {
		const targetHeroId = choice.slice("redirect:".length);
		// Redireciona o par de combate do herói-fonte para o herói-alvo
		const updatedPairs = gameOf(state).combat!.pairs.map((p) =>
			p.heroId === ctx.sourceHeroId ? { ...p, heroId: targetHeroId } : p,
		);
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, combat: { ...gameOf(state).combat!, pairs: updatedPairs } })),
			`Desvio de Foco: ataque redirecionado para herói ${targetHeroId}.`,
		);
	}

	// "tohit": bônus de acerto via ECS world (patch-18 Lote G)
	const bonus = 2;
	const mod: ModifierComponent = {
		type: "modifier",
		target: "hit_bonus",
		operation: "add",
		value: bonus,
		source: "skill_focus_deflection",
		duration: { kind: "once" },
	};
	const newWorld = addComponent(worldOf(state), ctx.sourceHeroId, mod);
	return log(
		withWorld(state, newWorld),
		`Desvio de Foco: +${bonus} de acerto neste ataque.`,
	);
};

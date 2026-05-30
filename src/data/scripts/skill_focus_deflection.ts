import type { ScriptHandler } from "@/core/scripts/types";
import { registerContinuation } from "@/core/skills/registry";
import { log } from "@/core/reducer/utils";

// skill_focus_deflection — Desvio de Foco
// Uma vez por sala, quando escolhido como alvo: redireciona para outro herói
// voluntário, ou aceita e ganha +2 no total de acerto.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.skillId) return ctx.state;

	const tohitBonus =
		typeof ctx.params.value === "number" ? ctx.params.value : 2;
	const otherHeroes = ctx.state.heroes.filter(
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
			label: `Redirecionar para ${otherHeroes[0]!.cardName}`,
		});
	}

	return {
		...ctx.state,
		pendingSkillChoice: {
			skillId: ctx.skillId,
			prompt:
				"Desvio de Foco: você foi escolhido como alvo. Como deseja responder?",
			options,
			sourceHeroId: ctx.sourceId,
		},
	};
};

// Continuação registrada por skillId (Patch-16 Lote C)
registerContinuation(
	"skill_focus_deflection",
	(state, ctx, choice): ReturnType<typeof log> => {
		if (!ctx.sourceHeroId || !state.combat) return state;

		if (choice.startsWith("redirect:")) {
			const targetHeroId = choice.slice("redirect:".length);
			// Redireciona o par de combate do herói-fonte para o herói-alvo
			const updatedPairs = state.combat.pairs.map((p) =>
				p.heroId === ctx.sourceHeroId
					? { ...p, heroId: targetHeroId }
					: p,
			);
			return log(
				{ ...state, combat: { ...state.combat, pairs: updatedPairs } },
				`Desvio de Foco: ataque redirecionado para herói ${targetHeroId}.`,
			);
		}

		// "tohit": bônus de acerto
		const bonus =
			typeof state.combat.bonusNextAttack[ctx.sourceHeroId] !== "undefined"
				? 2
				: 2;
		const prev = state.combat.bonusNextAttack[ctx.sourceHeroId] ?? [];
		return log(
			{
				...state,
				combat: {
					...state.combat,
					bonusNextAttack: {
						...state.combat.bonusNextAttack,
						[ctx.sourceHeroId]: [
							...prev,
							{ label: "Desvio de Foco", value: bonus },
						],
					},
				},
			},
			`Desvio de Foco: +${bonus} de acerto neste ataque.`,
		);
	},
);

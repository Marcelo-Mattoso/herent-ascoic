import type { ScriptHandler } from "@/core/scripts/types";
import { registerContinuation } from "@/core/skills/registry";
import { log } from "@/core/reducer/utils";

// power_deep_veil_echo — Eco Profundo do Véu
// Uma vez por jogo, ao derrotar uma criatura: ganha 1 Eco.
// Gaste o Eco via USE_SKILL → escolha: +3 acerto, -2 dano sofrido, ou ver 2 cartas inimigo.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.state.combat) return ctx.state;

	const currentEco = ctx.state.combat.ecoTokens[ctx.sourceId] ?? 0;
	return {
		...ctx.state,
		combat: {
			...ctx.state.combat,
			ecoTokens: {
				...ctx.state.combat.ecoTokens,
				[ctx.sourceId]: currentEco + 1,
			},
		},
		eventLog: [
			...ctx.state.eventLog,
			`Necromante: Eco Profundo — 1 Eco ganho (total: ${currentEco + 1}).`,
		],
	};
};

// spend — ativado por USE_SKILL quando o jogador decide gastar o Eco.
// Apresenta 3 opções.
export const spend: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.skillId) return ctx.state;
	const eco = ctx.state.combat?.ecoTokens[ctx.sourceId] ?? 0;
	if (eco <= 0) {
		return ctx.action.log("Eco Profundo: nenhum Eco disponível para gastar.");
	}
	return ctx.action.requestChoice([
		{ id: "tohit", label: "+3 no total de acerto neste ataque" },
		{ id: "damage_reduction", label: "Reduzir 2 de dano sofrido" },
		{ id: "peek_enemies", label: "Ver as 2 cartas do topo do deck de inimigos" },
	]);
};

// Continuação: aplica o efeito escolhido e consome o Eco.
registerContinuation(
	"power_deep_veil_echo",
	(state, ctx, choice): ReturnType<typeof log> => {
		if (!ctx.sourceHeroId || !state.combat) return state;

		const ecoTokens = {
			...state.combat.ecoTokens,
			[ctx.sourceHeroId]: Math.max(
				0,
				(state.combat.ecoTokens[ctx.sourceHeroId] ?? 0) - 1,
			),
		};

		if (choice === "tohit") {
			const prev = state.combat.bonusNextAttack[ctx.sourceHeroId] ?? [];
			return log(
				{
					...state,
					combat: {
						...state.combat,
						ecoTokens,
						bonusNextAttack: {
							...state.combat.bonusNextAttack,
							[ctx.sourceHeroId]: [...prev, { label: "Eco Profundo", value: 3 }],
						},
					},
				},
				"Eco Profundo gasto: +3 de acerto neste ataque.",
			);
		}

		if (choice === "damage_reduction") {
			const prevRed = state.combat.damageReduction[ctx.sourceHeroId] ?? 0;
			return log(
				{
					...state,
					combat: {
						...state.combat,
						ecoTokens,
						damageReduction: {
							...state.combat.damageReduction,
							[ctx.sourceHeroId]: prevRed + 2,
						},
					},
				},
				"Eco Profundo gasto: -2 no próximo dano sofrido.",
			);
		}

		if (choice === "peek_enemies") {
			const topTwo = state.decks.enemyDeck.available.slice(0, 2);
			return log(
				{ ...state, combat: { ...state.combat, ecoTokens } },
				`Eco Profundo gasto: próximos inimigos — ${topTwo.join(", ") || "deck vazio"}.`,
			);
		}

		return state;
	},
);

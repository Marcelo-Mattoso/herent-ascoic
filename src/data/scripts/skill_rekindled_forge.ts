import type { ScriptHandler } from "@/core/scripts/types";
import { registerContinuation } from "@/core/skills/registry";
import { log } from "@/core/reducer/utils";
import type { PendingReward } from "@/core/state/gameState";

// skill_rekindled_forge — Forja Reacesa
// Ao vencer a sala, o grupo pode recuperar 1 item descartado e equipá-lo.
// Apresenta escolha dos itens em itemDeck.discarded.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.skillId) return ctx.state;

	const discarded = ctx.state.decks.itemDeck.discarded;
	if (discarded.length === 0) {
		return ctx.action.log(
			"Forja Reacesa: nenhum item descartado disponível para recuperar.",
		);
	}

	const options = discarded.map((name) => ({
		id: name as string,
		label: name as string,
	}));

	return {
		...ctx.state,
		pendingSkillChoice: {
			skillId: ctx.skillId,
			prompt:
				"Forja Reacesa: escolha 1 item descartado para recuperar e equipar:",
			options,
			sourceHeroId: ctx.sourceId ?? undefined,
		},
	};
};

// Continuação: adiciona o item escolhido às recompensas pendentes e o remove do descarte.
registerContinuation(
	"skill_rekindled_forge",
	(state, _ctx, choice): ReturnType<typeof log> => {
		const discarded = state.decks.itemDeck.discarded;
		if (!discarded.includes(choice)) return state;

		const reward: PendingReward = {
			type: "item",
			cardId: choice,
			requiresBearer: false,
		};
		return log(
			{
				...state,
				decks: {
					...state.decks,
					itemDeck: {
						...state.decks.itemDeck,
						discarded: discarded.filter((n) => n !== choice),
					},
				},
				pendingRewards: [...state.pendingRewards, reward],
			},
			`Forja Reacesa: ${choice} recuperado do descarte.`,
		);
	},
);

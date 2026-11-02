import { log } from "@/core/reducer/utils";
import type { ScriptHandler, SkillContinuation } from "@/core/scripts/types";
import type { PendingReward } from "@/core/state/gameState";

import { deckOf, decksOf, withDecks } from "@/core/state/access";
import { withPendingSkillChoice } from "../../core/state/access";
import { withGame, gameOf } from "../../engine/state";
// skill_rekindled_forge — Forja Reacesa
// Ao vencer a sala, o grupo pode recuperar 1 item descartado e equipá-lo.
// Apresenta escolha dos itens em itemDeck.discarded.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.skillId) return ctx.state;

	const discarded = deckOf(ctx.state, "itemDeck").discarded;
	if (discarded.length === 0) {
		return ctx.action.log(
			"Forja Reacesa: nenhum item descartado disponível para recuperar.",
		);
	}

	const options = discarded.map((name) => ({
		id: name as string,
		label: name as string,
	}));

	return withPendingSkillChoice(ctx.state, {
			skillId: ctx.skillId,
			prompt:
				"Forja Reacesa: escolha 1 item descartado para recuperar e equipar:",
			options,
			sourceHeroId: ctx.sourceId ?? undefined,
		});
};

// Continuação: adiciona o item escolhido às recompensas pendentes e o remove do descarte.
export const continuation: SkillContinuation = (
	state,
	_ctx,
	choice,
) => {
	const discarded = deckOf(state, "itemDeck").discarded;
	if (!discarded.includes(choice)) return state;

	const reward: PendingReward = {
		type: "item",
		cardId: choice,
		requiresBearer: false,
	};
	return log(
		withDecks(withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: [...gameOf(state).pendingRewards, reward] })), {
				...decksOf(state),
				itemDeck: {
					...deckOf(state, "itemDeck"),
					discarded: discarded.filter((n) => n !== choice),
				},
			}),
		`Forja Reacesa: ${choice} recuperado do descarte.`,
	);
};

import type { ScriptHandler } from "@/core/scripts/types";
import type { PendingReward } from "@/core/state/gameState";

import { deckOf, decksOf, withDecks } from "@/core/state/access";
import { withGame, gameOf } from "../../engine/state";
// dungeon_skill_rekindled_forge — Forja Reacesa (dungeon)
// Ao vencer a sala, busca o primeiro item disponível (deck ou descarte)
// e o oferece como recompensa ao grupo.
export const run: ScriptHandler = (ctx) => {
	const { available, discarded } = deckOf(ctx.state, "itemDeck");

	// Tenta do topo do deck disponível primeiro
	if (available.length > 0) {
		const [chosen, ...rest] = available;
		const reward: PendingReward = {
			type: "item",
			cardId: chosen as string,
			requiresBearer: false,
		};
		return withDecks(withGame(ctx.state, (prevGame) => ({ ...prevGame, pendingRewards: [...gameOf(ctx.state).pendingRewards, reward], eventLog: [
				...gameOf(ctx.state).eventLog,
				`Forja Reacesa: ${chosen} sacado do deck e oferecido.`,
			] })), {
				...decksOf(ctx.state),
				itemDeck: { ...deckOf(ctx.state, "itemDeck"), available: rest },
			});
	}

	// Fallback: primeiro item descartado
	if (discarded.length > 0) {
		const [chosen, ...rest] = discarded;
		const reward: PendingReward = {
			type: "item",
			cardId: chosen as string,
			requiresBearer: false,
		};
		return withDecks(withGame(ctx.state, (prevGame) => ({ ...prevGame, pendingRewards: [...gameOf(ctx.state).pendingRewards, reward], eventLog: [
				...gameOf(ctx.state).eventLog,
				`Forja Reacesa: ${chosen} recuperado do descarte e oferecido.`,
			] })), {
				...decksOf(ctx.state),
				itemDeck: { ...deckOf(ctx.state, "itemDeck"), discarded: rest },
			});
	}

	return ctx.action.log("Forja Reacesa: nenhum item disponível nas pilhas.");
};

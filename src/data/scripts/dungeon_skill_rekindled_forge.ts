import type { ScriptHandler } from "@/core/scripts/types";
import type { PendingReward } from "@/core/state/gameState";

// dungeon_skill_rekindled_forge — Forja Reacesa (dungeon)
// Ao vencer a sala, busca o primeiro item disponível (deck ou descarte)
// e o oferece como recompensa ao grupo.
export const run: ScriptHandler = (ctx) => {
	const { available, discarded } = ctx.state.decks.itemDeck;

	// Tenta do topo do deck disponível primeiro
	if (available.length > 0) {
		const [chosen, ...rest] = available;
		const reward: PendingReward = {
			type: "item",
			cardId: chosen as string,
			requiresBearer: false,
		};
		return {
			...ctx.state,
			decks: {
				...ctx.state.decks,
				itemDeck: { ...ctx.state.decks.itemDeck, available: rest },
			},
			pendingRewards: [...ctx.state.pendingRewards, reward],
			eventLog: [
				...ctx.state.eventLog,
				`Forja Reacesa: ${chosen} sacado do deck e oferecido.`,
			],
		};
	}

	// Fallback: primeiro item descartado
	if (discarded.length > 0) {
		const [chosen, ...rest] = discarded;
		const reward: PendingReward = {
			type: "item",
			cardId: chosen as string,
			requiresBearer: false,
		};
		return {
			...ctx.state,
			decks: {
				...ctx.state.decks,
				itemDeck: { ...ctx.state.decks.itemDeck, discarded: rest },
			},
			pendingRewards: [...ctx.state.pendingRewards, reward],
			eventLog: [
				...ctx.state.eventLog,
				`Forja Reacesa: ${chosen} recuperado do descarte e oferecido.`,
			],
		};
	}

	return ctx.action.log("Forja Reacesa: nenhum item disponível nas pilhas.");
};

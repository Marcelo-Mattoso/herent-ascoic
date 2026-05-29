// drawItem: Espólios da Fornalha — ao vencer a sala, veja N cartas do deck de itens e fique com K.
// defaultValue: "2/1" → draw 2, keep 1.

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState, PendingReward } from "../../state/gameState";
import { registerContinuation } from "../registry";

function parseDraw(value: number | string | null): {
	draw: number;
	keep: number;
} {
	if (typeof value === "string") {
		const parts = value.split("/").map(Number);
		return { draw: parts[0] ?? 2, keep: parts[1] ?? 1 };
	}
	return { draw: 2, keep: 1 };
}

export function handleDrawItem(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	if (!ctx.skillId) return state;
	const { draw } = parseDraw(value);

	const available = state.decks.itemDeck.available;
	const drawn = available.slice(0, draw);
	if (drawn.length === 0)
		return log(state, "Deck de itens vazio — nenhum item sorteado.");

	const remaining = available.slice(draw);
	const next: GameState = {
		...state,
		decks: {
			...state.decks,
			itemDeck: { ...state.decks.itemDeck, available: remaining },
		},
		pendingSkillChoice: {
			skillId: ctx.skillId,
			prompt: `Espólios da Fornalha: escolha 1 item para ficar (os outros são descartados).`,
			options: drawn.map((name) => ({
				id: name as string,
				label: name as string,
			})),
		},
	};
	return log(
		next,
		`Espólios da Fornalha: ${drawn.length} itens revelados para escolha.`,
	);
}

registerContinuation(
	"drawItem",
	(state: GameState, _ctx: SkillContext, choice: string): GameState => {
		// choice = nome do item escolhido
		// Adicionar à fila de recompensas pendentes; os outros já saíram do deck e são descartados
		const reward: PendingReward = {
			type: "item",
			cardName: choice,
			requiresBearer: false,
		};
		return log(
			{ ...state, pendingRewards: [...state.pendingRewards, reward] },
			`Espólios da Fornalha: ${choice} adicionado às recompensas.`,
		);
	},
);

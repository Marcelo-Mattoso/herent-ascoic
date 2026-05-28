// Sistema de draw — operações de deck via API uniforme.
// Passo 6: funções puras sobre GameState. Passo 7 adicionará eventos de draw.

import type { GameState } from "../state/gameState";

export type DeckName = "dungeonDeck" | "enemyDeck" | "itemDeck" | "artifactDeck";

export function drawFromDeck(
	state: GameState,
	deck: DeckName,
	count: number,
): { state: GameState; cards: readonly string[] } {
	const deckState = state.decks[deck];
	const drawn = deckState.available.slice(0, count);
	const remaining = deckState.available.slice(count);
	return {
		state: {
			...state,
			decks: {
				...state.decks,
				[deck]: { ...deckState, available: remaining },
			},
		},
		cards: drawn,
	};
}

export function discardCards(
	state: GameState,
	deck: DeckName,
	cards: readonly string[],
): GameState {
	const deckState = state.decks[deck];
	return {
		...state,
		decks: {
			...state.decks,
			[deck]: {
				...deckState,
				discarded: [...deckState.discarded, ...cards],
			},
		},
	};
}

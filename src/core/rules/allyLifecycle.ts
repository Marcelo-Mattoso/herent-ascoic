// Aliados têm permanência em combate, mas nunca na mochila.
// Uma vez dispensados, não podem voltar à mesma partida — nem após reiniciar
// a masmorra, sacar outra recompensa ou tentar mover a carta manualmente.
import { cardById, type GameEngine } from "../gameEngine";
import { deckOf, decksOf, withDecks } from "../state/access";
import type { GameState } from "../state/gameState";
import { gameOf, withGame } from "../../engine/state";

export function isAllyCard(engine: GameEngine, cardId: string): boolean {
	return cardById(engine, cardId)?.type === "ally";
}

export function isRetiredAlly(state: GameState, cardId: string): boolean {
	return (gameOf(state).retiredAllyIds ?? []).includes(cardId);
}

/** Retirada definitiva, persistida no estado para impedir reaparecimento. */
export function retireAllies(
	engine: GameEngine,
	state: GameState,
	cardIds: readonly string[],
): GameState {
	const retired = [...new Set(cardIds.filter((id) => isAllyCard(engine, id)))];
	if (retired.length === 0) return state;
	const allRetired = [...new Set([...(gameOf(state).retiredAllyIds ?? []), ...retired])];
	let next = withGame(state, (g) => ({ ...g, retiredAllyIds: allRetired }));
	const pile = deckOf(next, "itemDeck");
	const ids = new Set(allRetired);
	const available = pile.available.filter((id) => !ids.has(id));
	const discarded = pile.discarded.filter((id) => !ids.has(id));
	if (available.length !== pile.available.length || discarded.length !== pile.discarded.length) {
		next = withDecks(next, {
			...decksOf(next),
			itemDeck: { ...pile, available, discarded },
		});
	}
	return next;
}

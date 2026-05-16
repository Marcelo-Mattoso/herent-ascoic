// Estado genérico de um deck de cartas.
// Cada deck (dungeon, inimigos, itens, artefatos) usa esta mesma estrutura.

export interface DeckState {
	// Cartas disponíveis para compra (topo = índice 0)
	readonly available: readonly string[];
	// Cartas descartadas (aguardando possível reembaralho)
	readonly discarded: readonly string[];
	// Cartas removidas permanentemente do jogo
	readonly removed: readonly string[];
}

export function createEmptyDeck(): DeckState {
	return { available: [], discarded: [], removed: [] };
}

// Contrato do Engine Adapter.
// Sela o core atrás de interface uniforme — permite troca por Worker, multi-aba, etc.
// sem que o chamador precise mudar.
//
// Passo 10: versão in-process implementada em inProcessAdapter.ts.
// Versão Worker (futuro): mesma interface, implementação diferente.

import type { Action } from "../actions/types";
import type { GameState } from "../state/gameState";

export interface EngineAdapter {
	// Promise mesmo na versão in-process — permite Worker depois sem mudar o chamador.
	dispatch(action: Action): Promise<GameState>;
	getState(): GameState;
	// Retorna a função de unsubscribe.
	subscribe(listener: (state: GameState) => void): () => void;
}

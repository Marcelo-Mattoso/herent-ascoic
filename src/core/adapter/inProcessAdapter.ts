// Implementação in-process do EngineAdapter.
// Resolve dispatch sincronamente (estado atualizado antes do Promise.resolve retornar).
//
// INVARIANTE: importar este módulo garante que "import '../skills/handlers/index'" rode
// transitivamente via reducer, populando o registry de skills antes de qualquer dispatch.
// Nunca importe o reducer diretamente fora de src/core/ — use este adapter.

import { reducer } from "../reducer/index"; // side-effect: popula o registry de skills
import type { Action } from "../actions/types";
import type { GameState } from "../state/gameState";
import type { EngineAdapter } from "./engineAdapter";

export function createInProcessAdapter(initial: GameState): EngineAdapter {
	let state = initial;
	const listeners = new Set<(state: GameState) => void>();

	return {
		dispatch(action: Action): Promise<GameState> {
			// Atualização é síncrona — listeners são notificados antes do Promise.resolve.
			state = reducer(state, action);
			for (const listener of listeners) {
				listener(state);
			}
			return Promise.resolve(state);
		},

		getState(): GameState {
			return state;
		},

		subscribe(listener: (state: GameState) => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

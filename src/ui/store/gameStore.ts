// Store Zustand do jogo.
// Passo 10: despacha ações via EngineAdapter em vez do reducer diretamente.
// API pública (useGameStore, dispatch, setFocusedHero, resolveSkillChoice, reset)
// permanece idêntica — componentes React não mudam.
//
// A instância do adapter é criada por createStore() e recriada no reset(),
// garantindo que cada partida tenha um gameId e um log próprios.

import { create } from "zustand";
import type { Action } from "@/core/actions/types";
import { createInProcessAdapter } from "@/core/adapter/inProcessAdapter";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";

// Estado de UI separado do estado de jogo (não serializado como save)
interface UiState {
	// Herói cujo inventário está visível no painel inferior
	focusedHeroId: string | null;
}

interface GameStore {
	state: GameState;
	ui: UiState;
	dispatch: (action: Action) => void;
	setFocusedHero: (heroId: string | null) => void;
	resolveSkillChoice: (choice: string) => void;
	reset: () => void;
}

const EMPTY_CONFIG = { heroCardNames: [] as string[] };

function createStore() {
	// O adapter é recriado no reset() para garantir partida + log separados.
	let adapter = createInProcessAdapter(createInitialGameState(EMPTY_CONFIG));

	return create<GameStore>((set, get) => ({
		state: adapter.getState(),
		ui: { focusedHeroId: null },

		dispatch: (action: Action) => {
			// dispatch é síncrono internamente — getState() já reflete o novo estado.
			adapter.dispatch(action);
			const nextState = adapter.getState();

			// Auto-focar o primeiro herói ativo se focusedHeroId for nulo ou herói inativo
			const currentFocus = get().ui.focusedHeroId;
			const activeHeroes = nextState.heroes.filter((h) => h.status === "active");
			const focusStillValid = currentFocus
				? activeHeroes.some((h) => h.id === currentFocus)
				: false;
			const focusedHeroId = focusStillValid
				? currentFocus
				: (activeHeroes[0]?.id ?? null);

			set({ state: nextState, ui: { focusedHeroId } });
		},

		setFocusedHero: (heroId) =>
			set((s) => ({ ui: { ...s.ui, focusedHeroId: heroId } })),

		resolveSkillChoice: (choice) => {
			const pending = get().state.pendingSkillChoice;
			if (!pending) return;
			get().dispatch({ type: "SKILL_CHOICE", payload: { skillId: pending.skillId, choice } });
		},

		reset: () => {
			// Descartar adapter antigo e criar nova instância para partida limpa.
			adapter = createInProcessAdapter(createInitialGameState(EMPTY_CONFIG));
			set({ state: adapter.getState(), ui: { focusedHeroId: null } });
		},
	}));
}

export const useGameStore = createStore();

import { create } from "zustand";
import type { Action } from "@/core/actions/types";
import { reducer } from "@/core/reducer";
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

export const useGameStore = create<GameStore>((set, get) => ({
	state: createInitialGameState(EMPTY_CONFIG),
	ui: { focusedHeroId: null },

	dispatch: (action: Action) => {
		const nextState = reducer(get().state, action);
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

	reset: () =>
		set({
			state: createInitialGameState(EMPTY_CONFIG),
			ui: { focusedHeroId: null },
		}),
}));

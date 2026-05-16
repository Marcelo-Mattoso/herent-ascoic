import { create } from "zustand";
import type { Action } from "@/core/actions/types";
import { reducer } from "@/core/reducer";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";

interface GameStore {
	state: GameState;
	dispatch: (action: Action) => void;
	reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
	state: createInitialGameState({ heroCardName: "" }),
	dispatch: (action: Action) => set({ state: reducer(get().state, action) }),
	reset: () => set({ state: createInitialGameState({ heroCardName: "" }) }),
}));

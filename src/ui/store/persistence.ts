// Persistência de partida em localStorage.
// Funcionalidade pronta mas desabilitada por padrão (FEATURE_FLAGS.enableSave = false).

import { FEATURE_FLAGS } from "@/core/config/defaults";
import type { GameState } from "@/core/state/gameState";

const STORAGE_KEY = "ascensao_heroica_save";

export function saveGame(state: GameState): void {
	if (!FEATURE_FLAGS.enableSave) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Falha silenciosa — localStorage pode estar indisponível
	}
}

export function loadGame(): GameState | null {
	if (!FEATURE_FLAGS.enableSave) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as GameState;
	} catch {
		return null;
	}
}

export function clearSave(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Falha silenciosa
	}
}

// Implementação de PersistencePort via localStorage.
// Usada quando FEATURE_FLAGS.enableSave = true.
// Quando desabilitado, todas as operações são no-op (exceto load que retorna vazio).
//
// Passo 12: implementação trocável sem tocar src/core/ — basta trocar a instância da porta.

import type { LoggedAction } from "../actions/types";
import { FEATURE_FLAGS } from "../config/defaults";
import type { PersistencePort } from "../ports/persistence";
import type { GameState } from "../state/gameState";

const SNAPSHOT_KEY = "ascensao_heroica_snapshot";
const ACTION_LOG_KEY = "ascensao_heroica_log";

function isEnabled(): boolean {
	return FEATURE_FLAGS.enableSave;
}

function tryGet<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		// localStorage indisponível ou JSON corrompido
		return null;
	}
}

function trySet(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Falha silenciosa em produção (quota excedida, modo privado, etc.)
		if (import.meta.env.DEV) {
			console.warn(`[persistence] Falha ao salvar ${key}`, value);
		}
	}
}

function tryRemove(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Silencioso
	}
}

export const localStoragePersistence: PersistencePort = {
	// ── Snapshot ────────────────────────────────────────────────────────────

	loadSnapshot(): GameState | null {
		if (!isEnabled()) return null;
		return tryGet<GameState>(SNAPSHOT_KEY);
	},

	saveSnapshot(state: GameState): void {
		if (!isEnabled()) return;
		// Snapshot não inclui actionLog (ficaria duplicado).
		const { actionLog: _omit, ...rest } = state;
		trySet(SNAPSHOT_KEY, rest);
	},

	clearSnapshot(): void {
		tryRemove(SNAPSHOT_KEY);
	},

	// ── Action log ──────────────────────────────────────────────────────────

	appendAction(entry: LoggedAction): void {
		if (!isEnabled()) return;
		const log = tryGet<LoggedAction[]>(ACTION_LOG_KEY) ?? [];
		log.push(entry);
		trySet(ACTION_LOG_KEY, log);
	},

	loadActionLog(): readonly LoggedAction[] {
		if (!isEnabled()) return [];
		return tryGet<LoggedAction[]>(ACTION_LOG_KEY) ?? [];
	},

	clearActionLog(): void {
		tryRemove(ACTION_LOG_KEY);
	},
};

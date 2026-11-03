// Implementação de PersistencePort via localStorage.
// Usada quando featureFlags.enableSave = true no ruleset da engine.
// Quando desabilitado, todas as operações são no-op (exceto load que retorna vazio).
//
// Passo 12: implementação trocável sem tocar src/core/ — basta trocar a instância da porta.

import { engineOf, gameOf } from "../../engine/state";
import type { LoggedAction } from "../actions/types";
import { type GameEngine, balanceOf, gameVersion } from "../gameEngine";
import { unwrapSnapshot, wrapSnapshot } from "./migrations";
import type { PersistencePort } from "../ports/persistence";
import type { GameState } from "../state/gameState";

const SNAPSHOT_KEY = "ascensao_heroica_snapshot";
const ACTION_LOG_KEY = "ascensao_heroica_log";

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

export function createLocalStoragePersistence(
	engine: GameEngine,
): PersistencePort {
	const isEnabled = () => balanceOf(engine).featureFlags.enableSave;
	return {
		// ── Snapshot ────────────────────────────────────────────────────────────

		loadSnapshot(): GameState | null {
			if (!isEnabled()) return null;
			const raw = tryGet<unknown>(SNAPSHOT_KEY);
			return raw === null ? null : (unwrapSnapshot(raw) as GameState | null);
		},

		saveSnapshot(state: GameState): void {
			if (!isEnabled()) return;
			// Snapshot não inclui actionLog (ficaria duplicado).
			const { actionLog: _omit, ...game } = gameOf(state);
			const snapshot = { engine: engineOf(state), game };
			trySet(SNAPSHOT_KEY, wrapSnapshot(snapshot, gameVersion(engine)));
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
}

import type { Action } from "@/core/actions/types";
import { createInProcessAdapter } from "@/core/adapter/inProcessAdapter";
import { createLocalStoragePersistence } from "@/core/persistence/localStoragePersistence";
import type { PersistencePort } from "@/core/ports/persistence";
import { isLogIntact } from "@/core/ports/persistence";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";
import { uiEngine } from "@/ui/engine";
import { gameOf } from "../../engine/state";

const SNAPSHOT_INTERVAL = 10; // Salva snapshot a cada K dispatches

// Porta ativa — trocável sem tocar src/core/.
export const persistence: PersistencePort = createLocalStoragePersistence(uiEngine);

// Reconstrói o GameState a partir do action log (replay determinístico).
// Usa o adapter em vez do reducer diretamente — mantém o padrão Passo 10.
function replayFromLog(port: PersistencePort): GameState | null {
	const log = port.loadActionLog();
	if (!isLogIntact(log)) return null;

	const initial = createInitialGameState({ heroCardIds: [] });
	try {
		const adapter = createInProcessAdapter(uiEngine, initial);
		for (const entry of log) {
			adapter.dispatch(entry.action as Action);
		}
		return adapter.getState();
	} catch {
		if (import.meta.env.DEV)
			console.warn("[persistence] Falha no replay do log");
		return null;
	}
}

// Tenta carregar o estado salvo na ordem de prioridade definida.
// Retorna null se uiEngine.ruleset.balance.featureFlags.enableSave = false ou se não há nada salvo.
export function loadPersistedState(): GameState | null {
	if (!uiEngine.ruleset.balance.featureFlags.enableSave) return null;

	// 1. Log íntegro → replay autoritativo.
	const fromLog = replayFromLog(persistence);
	if (fromLog) return fromLog;

	// 2. Log vazio/corrompido → snapshot como fallback.
	const snapshot = persistence.loadSnapshot();
	if (snapshot) return snapshot;

	// 3. Nenhum dado salvo.
	return null;
}

// Hooks de ciclo de vida chamados pelo gameStore em cada dispatch.

let dispatchCount = 0;

export function onDispatch(state: GameState): void {
	if (!uiEngine.ruleset.balance.featureFlags.enableSave) return;

	const lastEntry = gameOf(state).actionLog[gameOf(state).actionLog.length - 1];
	if (lastEntry) {
		persistence.appendAction(lastEntry);
	}

	dispatchCount++;
	if (dispatchCount % SNAPSHOT_INTERVAL === 0) {
		persistence.saveSnapshot(state);
	}
}

export function onStatusTransition(state: GameState): void {
	if (!uiEngine.ruleset.balance.featureFlags.enableSave) return;
	persistence.saveSnapshot(state);
}

export function onReset(): void {
	persistence.clearSnapshot();
	persistence.clearActionLog();
	dispatchCount = 0;
}

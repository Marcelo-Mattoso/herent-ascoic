import type { Action, LoggedAction } from "../actions/types";
import { createInProcessAdapter } from "../adapter/inProcessAdapter";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { GameEngine } from "../gameEngine";
import { migrateState, REPLAY_MIGRATIONS, STATE_VERSION } from "../persistence/migrations";
import { gameOf } from "../../engine/state";

// Pacote de replay serializável — contém tudo necessário para reproduzir a partida.
export interface ReplayPackage {
	readonly stateVersion: number;
	readonly gameId: string;
	readonly seed: number;
	readonly actionLog: readonly LoggedAction[];
}

// Constrói um pacote de export a partir do GameState corrente.
// Extrai seed de actionLog[0] (START_GAME).
export function buildReplayPackage(state: GameState): ReplayPackage {
	const firstEntry = gameOf(state).actionLog[0];
	const seed =
		firstEntry?.action.type === "START_GAME"
			? ((firstEntry.action as { payload?: { seed?: number } }).payload?.seed ??
				0)
			: 0;

	return {
		stateVersion: STATE_VERSION,
		gameId: gameOf(state).gameId,
		seed,
		actionLog: gameOf(state).actionLog,
	};
}

// Reproduz todas as actions de um pacote, retornando o estado final.
// Usa um adapter separado — não contamina a partida em curso.
export function replayFromPackage(engine: GameEngine, pkg: ReplayPackage): GameState {
	const initial = createInitialGameState({ heroCardIds: [] });
	const adapter = createInProcessAdapter(engine, initial);

	for (const entry of pkg.actionLog) {
		adapter.dispatch(entry.action as Action);
	}

	return adapter.getState();
}

// Retorna todos os estados intermediários (cursor-friendly para o viewer).
// Estados[0] = estado inicial, estados[N] = após N actions.
export function buildReplayStates(engine: GameEngine, pkg: ReplayPackage): readonly GameState[] {
	const initial = createInitialGameState({ heroCardIds: [] });
	const states: GameState[] = [initial];
	const adapter = createInProcessAdapter(engine, initial);

	for (const entry of pkg.actionLog) {
		adapter.dispatch(entry.action as Action);
		states.push(adapter.getState());
	}

	return states;
}

// Serializa um pacote para JSON (para download).
export function exportPackageToJson(pkg: ReplayPackage): string {
	return JSON.stringify(pkg, null, 2);
}

// Desserializa um pacote de JSON (para import).
// Retorna null se o JSON for inválido.
export function importPackageFromJson(json: string): ReplayPackage | null {
	try {
		const parsed = JSON.parse(json) as unknown;
		if (!isReplayPackage(parsed)) return null;
		const version = (parsed as { stateVersion?: unknown }).stateVersion ?? 0;
		if (typeof version !== "number") return null;
		const migrated = migrateState(parsed, version, REPLAY_MIGRATIONS);
		return migrated === null
			? null
			: ({ ...(migrated as ReplayPackage), stateVersion: STATE_VERSION });
	} catch {
		return null;
	}
}

function isReplayPackage(value: unknown): value is Omit<ReplayPackage, "stateVersion"> {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.gameId === "string" &&
		typeof obj.seed === "number" &&
		Array.isArray(obj.actionLog)
	);
}

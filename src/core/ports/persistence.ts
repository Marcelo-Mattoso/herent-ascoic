// Porta abstrata de persistência.
// O core define o contrato; a implementação (localStorage, IndexedDB, etc.) fica fora.
//
// Passo 12: política de coerência — o log é a verdade, snapshot é otimização.
//
// Boot:
//   1. loadActionLog() — se log íntegro (seq=0 = START_GAME, seqs contíguos),
//      reconstruir estado via reducerCore.
//   2. Se log vazio/corrompido E FEATURE_FLAGS.enableSave, usar loadSnapshot().
//   3. Se ambos vazios, estado inicial.
//
// Integridade do log: começa em seq=0 com START_GAME, seqs contíguos sem buracos.
// Se não, descartar e usar snapshot ou estado inicial.

import type { LoggedAction } from "../actions/types";
import type { GameState } from "../state/gameState";

export interface PersistencePort {
	// ── Snapshot (estado completo serializado) ─────────────────────────────
	loadSnapshot(): GameState | null;
	saveSnapshot(state: GameState): void;
	clearSnapshot(): void;

	// ── Log autoritativo de actions ────────────────────────────────────────
	// appendAction é chamado a cada dispatch (uma action por vez).
	appendAction(entry: LoggedAction): void;
	loadActionLog(): readonly LoggedAction[];
	clearActionLog(): void;
}

// Verifica se um log de actions é íntegro:
// - não vazio
// - primeiro elemento é START_GAME com seq=0
// - seqs são contíguos (0, 1, 2, ...)
export function isLogIntact(log: readonly LoggedAction[]): boolean {
	if (log.length === 0) return false;
	if (log[0]!.seq !== 0) return false;
	if (log[0]!.action.type !== "START_GAME") return false;
	for (let i = 1; i < log.length; i++) {
		if (log[i]!.seq !== i) return false;
	}
	return true;
}

// Consulta à tabela de transições injetada no PhaseFlow (transitions.json); a validação em execução é feita por engine.flow.dispatch.

import type { GameEngine } from "../gameEngine";
import type { GameStatus } from "../state/status";

export function canTransition(
	engine: GameEngine,
	from: GameStatus,
	to: GameStatus,
): boolean {
	return engine.flow.canTransition(from, to);
}

export function assertTransition(
	engine: GameEngine,
	from: GameStatus,
	to: GameStatus,
): void {
	if (from === to) return; // sem mudança: sempre permitido
	if (!canTransition(engine, from, to)) {
		const msg = `[StateMachine] Transição inválida: ${from} → ${to}`;
		// Lança em dev/test (import.meta.env.PROD é false em ambos); só loga em prod.
		if (!import.meta.env?.PROD) {
			throw new Error(msg);
		}
		console.error(msg);
	}
}

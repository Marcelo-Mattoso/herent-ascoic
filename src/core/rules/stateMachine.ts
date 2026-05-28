// Máquina de estados explícita. A tabela de transições válidas vive em src/data/transitions.json.
// Toda escrita em state.status no reducer deve chamar assertTransition antes.

import TRANSITIONS from "../../data/transitions.json";
import type { GameStatus } from "../state/status";

const table = TRANSITIONS as Partial<Record<GameStatus, readonly GameStatus[]>>;

export function canTransition(from: GameStatus, to: GameStatus): boolean {
	return table[from]?.includes(to) ?? false;
}

export function assertTransition(from: GameStatus, to: GameStatus): void {
	if (from === to) return; // sem mudança: sempre permitido
	if (!canTransition(from, to)) {
		const msg = `[StateMachine] Transição inválida: ${from} → ${to}`;
		// Lança em dev/test (import.meta.env.PROD é false em ambos); só loga em prod.
		if (!import.meta.env?.PROD) {
			throw new Error(msg);
		}
		console.error(msg);
	}
}

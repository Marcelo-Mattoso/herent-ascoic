// Projeção completa para o replay viewer.
// Igual ao PlayerView por enquanto — existe como tipo distinto para evoluir
// independentemente (ex: expor campos de debug, histórico de dano, stacktrace de efeitos).
//
// Passo 9: esqueleto — evolui no Passo 13 quando o Replay Viewer for implementado.

import type { GameState } from "../state/gameState";
import { playerView } from "./playerView";
import type { PlayerView } from "./playerView";

// ReplayView é idêntico ao PlayerView agora.
// Tipo distinto para permitir divergência futura sem quebrar o contrato da UI.
export type ReplayView = PlayerView;

export function replayView(state: GameState): ReplayView {
	return playerView(state);
}

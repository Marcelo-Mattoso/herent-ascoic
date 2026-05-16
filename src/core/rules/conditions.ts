// Verificação de condição de acesso ao boss.
// Cada boss tem sua própria condição — expandir o switch para novos bosses futuramente.

import type { GameState } from "../state/gameState";

export function checkBossCondition(
	state: GameState,
	bossCardName: string,
): boolean {
	switch (bossCardName) {
		case "Azhakar, Dragão da Fornalha Sombria":
			return state.groupArtifacts.length >= 2;
		default:
			return false;
	}
}

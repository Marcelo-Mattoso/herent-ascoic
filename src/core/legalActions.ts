import type { Action } from "./actions/types";
import { PARTY_PLAYER } from "./choices";
import type { GameEngine } from "./gameEngine";
import type { GameState } from "./state/gameState";

export function legalActions(
	engine: GameEngine,
	state: GameState,
	player: string = PARTY_PLAYER,
): Action[] {
	return engine.flow.legalActions(state, player, engine);
}

import type { GameEngine } from "../gameEngine";
import { endScope } from "./access";
import type { GameState } from "./gameState";

export function beginRoom(engine: GameEngine, state: GameState): GameState {
	return endScope(state, engine.scopes.registry, "room");
}

export function beginCombat(engine: GameEngine, state: GameState): GameState {
	return endScope(state, engine.scopes.registry, "combat");
}

export function beginRound(engine: GameEngine, state: GameState): GameState {
	return endScope(state, engine.scopes.registry, "round");
}

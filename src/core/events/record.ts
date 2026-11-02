import { appendEvent, type EventMeta } from "../../engine/events";
import { hasEngineEvents, withoutEngineEvents } from "../state/access";
import type { GameState } from "../state/gameState";
import type { GameEventMap } from "./types";
import { withGame, gameOf } from "../../engine/state";

export function recordEvent<K extends keyof GameEventMap & string>(
	state: GameState,
	type: K,
	payload: GameEventMap[K],
	meta?: EventMeta,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, events: appendEvent(gameOf(state).events, type, payload, meta) }));
}

export function clearEvents(state: GameState): GameState {
	const cleared =
		gameOf(state).events.length === 0 ? state : withGame(state, (prevGame) => ({ ...prevGame, events: [] }));
	return hasEngineEvents(cleared) ? withoutEngineEvents(cleared) : cleared;
}

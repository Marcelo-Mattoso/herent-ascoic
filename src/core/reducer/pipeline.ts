import type { Action } from "../actions/types";
import { prunePreparedAbilities } from "../abilities/prepared";
import { recordAlphaAction } from "../diagnostics/alphaLog";
import { drainStack } from "../effects/resolver";
import { clearEvents, recordEvent } from "../events/record";
import type { GameEngine } from "../gameEngine";
import { pendingSkillChoiceOf, pendingSkillTargetOf, pendingSkillWindowOf, pendingTriggerInterruptOf } from "../state/access";
import type { GameState } from "../state/gameState";
import { gameOf, withGame } from "../../engine/state";

function withoutResolvedInterruptFlags(state: GameState): GameState {
	const resolved = Object.keys(gameOf(state).flags).some((key) =>
		key.startsWith("triggerInterruptResolved::"),
	);
	if (!resolved) return state;
	return withGame(state, (prevGame) => ({
		...prevGame,
		flags: Object.fromEntries(
			Object.entries(gameOf(state).flags).filter(
				([key]) => !key.startsWith("triggerInterruptResolved::"),
			),
		),
	}));
}

export function reducerCore(
	engine: GameEngine,
	previous: GameState,
	action: Action,
): GameState {
	const state = clearEvents(previous);
	const ready =
		!pendingTriggerInterruptOf(state) &&
		!pendingSkillWindowOf(state) &&
		!pendingSkillChoiceOf(state) &&
		!pendingSkillTargetOf(state) &&
		action.type !== "APPLY_TRIGGER_INTERRUPT" &&
		action.type !== "SKIP_TRIGGER_INTERRUPT"
			? withoutResolvedInterruptFlags(state)
			: state;
	const result = engine.flow.dispatch(ready, action, engine);
	if (result.rejection?.code === "invalid_transition") {
		const message = `[StateMachine] Transição inválida: ${result.rejection.from} → ${result.rejection.to}`;
		if (!import.meta.env?.PROD) throw new Error(message);
		console.error(message);
	}
	const validated =
		result.change && action.type !== "START_GAME"
			? recordEvent(result.state, "StatusChanged", {
					from: result.change.from as GameState["game"]["status"],
					to: result.change.to as GameState["game"]["status"],
					action: action.type,
				})
			: result.state;
	return recordAlphaAction(engine, state, prunePreparedAbilities(engine, drainStack(engine, validated), state), action);
}

export function reducer(
	engine: GameEngine,
	previous: GameState,
	action: Action,
): GameState {
	const state = clearEvents(previous);
	const next = reducerCore(engine, state, action);
	if (
		next === state &&
		(action.type === "INV_MOVE" ||
			action.type === "INV_ASSIGN_ITEM" ||
			action.type === "CHOOSE_ITEM_DESTINATION")
	)
		return state;
	const newEntry = { seq: 0, action };
	if (action.type === "START_GAME") {
		return withGame(next, (prevGame) => ({
			...prevGame,
			actionLog: [newEntry],
		}));
	}
	const seq = gameOf(next).actionLog.length;
	return withGame(next, (prevGame) => ({
		...prevGame,
		actionLog: [...gameOf(next).actionLog, { seq, action }],
	}));
}

export type Reducer = (state: GameState, action: Action) => GameState;

export function createReducer(engine: GameEngine): Reducer {
	return (state, action) => reducer(engine, state, action);
}

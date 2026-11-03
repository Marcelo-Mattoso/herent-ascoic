import type { PlayerId } from "./events";
import type { ScopeRegistry } from "./scopes";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import { NO_TURNS, type TurnConfig, type TurnState } from "./turn";

export function configureTurns<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	config: TurnConfig,
): EngineState<TMap> {
	if (config.order.length === 0) throw new Error("Ordem de turno vazia");
	if (config.phases.length === 0) throw new Error("Turno sem etapas");
	if (new Set(config.order).size !== config.order.length) {
		throw new Error("Jogador repetido na ordem de turno");
	}
	for (const player of config.order) {
		if (!state.players.includes(player)) {
			throw new Error(`Jogador desconhecido na ordem de turno: "${player}"`);
		}
	}
	const priority = config.priority ?? "active-first";
	if (typeof priority !== "string") {
		const sorted = [...priority].sort().join();
		if (sorted !== [...config.order].sort().join()) {
			throw new Error("Prioridade deve citar exatamente os jogadores da ordem");
		}
	}
	return {
		...state,
		turn: { ...NO_TURNS, order: config.order, phases: config.phases, priority },
	};
}

export function activePlayer<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): PlayerId {
	const { order, active } = state.turn;
	if (order.length === 0) throw new Error("Turnos não configurados");
	return order[active];
}

export function currentPhase<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): string {
	return state.turn.phases[state.turn.phase];
}

function enter<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	turn: TurnState,
	announceTurn: boolean,
): EngineState<TMap> {
	const player = turn.order[turn.active];
	let next: EngineState<TMap> = { ...state, turn };
	if (announceTurn) {
		next = recordEvent(next, "turno.iniciado", {
			player,
			turn: turn.turn,
			round: turn.round,
		});
	}
	return recordEvent(next, "etapa.iniciada", {
		phase: turn.phases[turn.phase],
		player,
		turn: turn.turn,
	});
}

export function startTurns<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): EngineState<TMap> {
	if (state.turn.order.length === 0) throw new Error("Turnos não configurados");
	if (state.turn.turn !== 0) throw new Error("Turnos já iniciados");
	return enter(
		state,
		{ ...state.turn, active: 0, phase: 0, turn: 1, round: 1 },
		true,
	);
}

export function clearScope<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	registry: ScopeRegistry,
	ended: string,
): EngineState<TMap> {
	registry.assert(ended);
	const kept: Record<string, number> = {};
	let cleared = 0;
	for (const [key, value] of Object.entries(state.counters)) {
		const scope = key.slice(0, key.indexOf(":"));
		if (registry.has(scope) && registry.isWithin(scope, ended)) cleared++;
		else kept[key] = value;
	}
	return recordEvent({ ...state, counters: kept }, "escopo.encerrado", {
		scope: ended,
		cleared,
	});
}

export function advancePhase<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	scopes?: ScopeRegistry,
): EngineState<TMap> {
	const { turn } = state;
	if (turn.turn === 0) throw new Error("Turnos não iniciados");
	const ended =
		scopes?.has("phase") === true ? clearScope(state, scopes, "phase") : state;
	if (turn.phase + 1 >= turn.phases.length) return endTurn(ended, scopes);
	return enter(ended, { ...turn, phase: turn.phase + 1 }, false);
}

export function endTurn<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	scopes?: ScopeRegistry,
): EngineState<TMap> {
	const { turn } = state;
	if (turn.turn === 0) throw new Error("Turnos não iniciados");
	let current = recordEvent(state, "turno.encerrado", {
		player: turn.order[turn.active],
		turn: turn.turn,
		round: turn.round,
	});
	if (scopes?.has("turn")) current = clearScope(current, scopes, "turn");
	const wraps = turn.active + 1 >= turn.order.length;
	if (wraps && scopes?.has("round")) {
		current = clearScope(current, scopes, "round");
	}
	return enter(
		current,
		{
			...turn,
			active: wraps ? 0 : turn.active + 1,
			phase: 0,
			turn: turn.turn + 1,
			round: wraps ? turn.round + 1 : turn.round,
		},
		true,
	);
}

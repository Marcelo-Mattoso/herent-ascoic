import { openChoice } from "./choice";
import type { PlayerId } from "./events";
import type { KindNode, KindRegistry } from "./kinds";
import {
	type EngineEventMap,
	type EngineState,
	type GameState,
	recordEvent,
} from "./state";
import type { StackOrder } from "./stack";
import { priorityOrder } from "./turn";

export type WindowPolicy = StackOrder | ((cause: string) => StackOrder);

export interface WindowItem {
	readonly id: string;
	readonly seq: number;
	readonly player: PlayerId;
	readonly cause: string;
	readonly nodes: readonly KindNode[];
}

export interface ResponseWindow {
	readonly id: string;
	readonly cause: string;
	readonly order: StackOrder;
	readonly players: readonly PlayerId[];
	readonly holder: number;
	readonly passes: number;
	readonly resolving: boolean;
	readonly submitted: number;
	readonly items: readonly WindowItem[];
}

export interface WindowConfig {
	readonly id: string;
	readonly cause: string;
	readonly policy: WindowPolicy;
	readonly opener?: PlayerId;
}

export function windowOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): ResponseWindow | undefined {
	return state.window;
}

export function windowHolder(window: ResponseWindow): PlayerId {
	return window.players[window.holder] as PlayerId;
}

function orderFor(policy: WindowPolicy, cause: string): StackOrder {
	return typeof policy === "function" ? policy(cause) : policy;
}

function seatsFor<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	opener: PlayerId | undefined,
): readonly PlayerId[] {
	const base =
		state.turn.order.length > 0 ? priorityOrder(state.turn) : state.players;
	if (base.length === 0) throw new Error("Janela sem jogadores");
	if (opener === undefined) return base;
	const at = base.indexOf(opener);
	if (at < 0) throw new Error(`Jogador "${opener}" não está na partida`);
	return [...base.slice(at), ...base.slice(0, at)];
}

export function openWindow<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	config: WindowConfig,
): EngineState<TMap> {
	if (state.window) {
		throw new Error(`Já existe janela aberta: "${state.window.id}"`);
	}
	const players = seatsFor(state, config.opener);
	const window: ResponseWindow = {
		id: config.id,
		cause: config.cause,
		order: orderFor(config.policy, config.cause),
		players,
		holder: 0,
		passes: 0,
		resolving: false,
		submitted: 0,
		items: [],
	};
	return recordEvent({ ...state, window }, "janela.aberta", {
		window: window.id,
		cause: window.cause,
		order: window.order,
		holder: players[0] as PlayerId,
	});
}

function requireHolder(
	window: ResponseWindow | undefined,
	player: PlayerId,
): ResponseWindow {
	if (!window) throw new Error("Nenhuma janela aberta");
	if (window.resolving) throw new Error("A janela já está resolvendo");
	if (windowHolder(window) !== player) {
		throw new Error(
			`Jogador "${player}" não tem prioridade (vez de "${windowHolder(window)}")`,
		);
	}
	return window;
}

export function respondInWindow<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	player: PlayerId,
	nodes: readonly KindNode[],
	cause = "resposta",
): EngineState<TMap> {
	const window = requireHolder(state.window, player);
	const seq = window.submitted;
	const item: WindowItem = {
		id: `${window.id}:${seq}`,
		seq,
		player,
		cause,
		nodes,
	};
	return recordEvent(
		{
			...state,
			window: {
				...window,
				items: [...window.items, item],
				submitted: window.submitted + 1,
				passes: 0,
			},
		},
		"janela.resposta",
		{ window: window.id, player, item: item.id },
	);
}

export interface PassOutcome<TMap extends EngineEventMap> {
	readonly state: EngineState<TMap>;
	readonly closed: boolean;
}

export function passInWindow<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	player: PlayerId,
): PassOutcome<TMap> {
	const window = requireHolder(state.window, player);
	const passes = window.passes + 1;
	const passed = recordEvent(state, "janela.passe", {
		window: window.id,
		player,
	});
	if (passes >= window.players.length) {
		return {
			state: { ...passed, window: { ...window, passes, resolving: true } },
			closed: true,
		};
	}
	return {
		state: {
			...passed,
			window: {
				...window,
				passes,
				holder: (window.holder + 1) % window.players.length,
			},
		},
		closed: false,
	};
}

export function resolutionOrder(window: ResponseWindow): readonly WindowItem[] {
	const sorted = [...window.items].sort((a, b) => a.seq - b.seq);
	return window.order === "lifo" ? sorted.reverse() : sorted;
}

export function resolveWindow<TGame, TMap extends EngineEventMap, TCtx>(
	registry: KindRegistry<GameState<TGame, TMap>, TCtx, never>,
	state: GameState<TGame, TMap>,
	ctxOf: (item: WindowItem) => TCtx,
): GameState<TGame, TMap> {
	let current = state;
	for (;;) {
		const window = current.engine.window;
		if (!window?.resolving) {
			throw new Error("Janela não está em resolução");
		}
		const [next] = resolutionOrder(window);
		if (!next) {
			const { window: _closed, ...engine } = current.engine;
			return {
				...current,
				engine: recordEvent(engine as EngineState<TMap>, "janela.resolvida", {
					window: window.id,
					resolved: window.submitted,
					order: window.order,
				}),
			};
		}
		const remaining = window.items.filter((item) => item.id !== next.id);
		const outcome = registry.runAll(
			{
				...current,
				engine: {
					...current.engine,
					window: { ...window, items: remaining },
				},
			},
			next.nodes,
			ctxOf(next),
		);
		current = outcome.state;
		if (outcome.pending) {
			return {
				...current,
				engine: openChoice(current.engine, outcome.pending, outcome.stack),
			};
		}
	}
}

export function windowIsOpen<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): boolean {
	return state.window !== undefined;
}

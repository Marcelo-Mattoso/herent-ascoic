export const ANY_PHASE = "*";

export interface ActionLike {
	readonly type: string;
}

export interface PhaseHandler<
	TState,
	TAction extends ActionLike,
	TEnv = undefined,
> {
	readonly id: string;
	readonly phases: readonly string[] | typeof ANY_PHASE;
	readonly actions: readonly TAction["type"][];
	readonly exclusive?: boolean;
	accepts?(state: TState, action: TAction, env: TEnv): boolean;
	blocks?(state: TState, action: TAction, env: TEnv): boolean;
	onEnter?(state: TState, env: TEnv): TState;
	legalActions(state: TState, player: string, env: TEnv): readonly TAction[];
	apply(state: TState, action: TAction, env: TEnv): TState;
	onExit?(state: TState, env: TEnv): TState;
}

export interface Transition<TState, TAction extends ActionLike> {
	readonly from: string;
	readonly on: string;
	readonly to: string;
	readonly guard?: (state: TState, action: TAction) => boolean;
}

export type RejectionCode =
	| "unhandled"
	| "blocked"
	| "invalid_transition";

export interface Rejection {
	readonly code: RejectionCode;
	readonly message: string;
	readonly applied: boolean;
	readonly from?: string;
	readonly to?: string;
}

export interface PhaseChange {
	readonly from: string;
	readonly to: string;
}

export interface DispatchResult<TState> {
	readonly state: TState;
	readonly handler?: string;
	readonly change?: PhaseChange;
	readonly rejection?: Rejection;
}

export interface PhaseFlowConfig<
	TState,
	TAction extends ActionLike,
	TEnv = undefined,
> {
	phaseOf(state: TState): string;
	handlers: readonly PhaseHandler<TState, TAction, TEnv>[];
	transitions: readonly Transition<TState, TAction>[];
	onInvalidTransition?: "reject" | "apply-and-report";
}

export interface PhaseFlow<TState, TAction extends ActionLike, TEnv = undefined> {
	readonly handlers: readonly PhaseHandler<TState, TAction, TEnv>[];
	readonly transitions: readonly Transition<TState, TAction>[];
	phaseOf(state: TState): string;
	canTransition(from: string, to: string, on?: string): boolean;
	targetsFrom(from: string): readonly string[];
	handlerFor(
		state: TState,
		action: TAction,
		env: TEnv,
	): PhaseHandler<TState, TAction, TEnv> | undefined;
	legalActions(state: TState, player: string, env: TEnv): TAction[];
	dispatch(state: TState, action: TAction, env: TEnv): DispatchResult<TState>;
}

function appliesTo(
	handler: { readonly phases: readonly string[] | typeof ANY_PHASE },
	phase: string,
): boolean {
	return handler.phases === ANY_PHASE || handler.phases.includes(phase);
}

function matches(pattern: string, value: string): boolean {
	return pattern === ANY_PHASE || pattern === value;
}

export function transitionsFromMap<
	TState = unknown,
	TAction extends ActionLike = ActionLike,
>(
	table: Readonly<Record<string, readonly string[] | undefined>>,
): readonly Transition<TState, TAction>[] {
	return Object.entries(table).flatMap(([from, targets]) =>
		(targets ?? []).map((to) => ({ from, on: ANY_PHASE, to })),
	);
}

export function createPhaseFlow<
	TState,
	TAction extends ActionLike,
	TEnv = undefined,
>(
	config: PhaseFlowConfig<TState, TAction, TEnv>,
): PhaseFlow<TState, TAction, TEnv> {
	const { handlers, transitions, phaseOf } = config;
	const policy = config.onInvalidTransition ?? "reject";
	const ids = new Set<string>();
	for (const handler of handlers) {
		if (ids.has(handler.id)) {
			throw new Error(`createPhaseFlow: handler duplicado "${handler.id}"`);
		}
		ids.add(handler.id);
		if (handler.actions.length === 0) {
			throw new Error(`createPhaseFlow: handler "${handler.id}" sem actions`);
		}
	}

	const flow: PhaseFlow<TState, TAction, TEnv> = {
		handlers,
		transitions,
		phaseOf,
		canTransition(from, to, on) {
			return transitions.some(
				(t) =>
					matches(t.from, from) &&
					matches(t.to, to) &&
					(t.on === ANY_PHASE || t.on === on),
			);
		},
		targetsFrom(from) {
			return [
				...new Set(
					transitions.filter((t) => matches(t.from, from)).map((t) => t.to),
				),
			];
		},
		handlerFor(state, action, env) {
			const phase = phaseOf(state);
			const owners = handlers.filter(
				(h) =>
					h.actions.includes(action.type) &&
					(h.accepts ? h.accepts(state, action, env) : true),
			);
			return owners.find((h) => appliesTo(h, phase)) ?? owners[0];
		},
		legalActions(state, player, env) {
			const phase = phaseOf(state);
			const active = handlers.filter((h) => appliesTo(h, phase));
			const out: TAction[] = [];
			for (const handler of active) {
				const own = handler.legalActions(state, player, env);
				if (handler.exclusive && own.length > 0) return [...own];
				out.push(...own);
			}
			return out;
		},
		dispatch(state, action, env) {
			for (const handler of handlers) {
				if (handler.blocks?.(state, action, env)) {
					return {
						state,
						handler: handler.id,
						rejection: {
							code: "blocked",
							message: `Action "${action.type}" bloqueada por "${handler.id}"`,
							applied: false,
						},
					};
				}
			}
			const handler = flow.handlerFor(state, action, env);
			if (!handler) {
				return {
					state,
					rejection: {
						code: "unhandled",
						message: `Nenhum handler para a action "${action.type}"`,
						applied: false,
					},
				};
			}
			const from = phaseOf(state);
			const applied = handler.apply(state, action, env);
			const to = phaseOf(applied);
			if (from === to) return { state: applied, handler: handler.id };

			const allowed = transitions.some(
				(t) =>
					matches(t.from, from) &&
					matches(t.to, to) &&
					matches(t.on, action.type) &&
					(t.guard ? t.guard(state, action) : true),
			);
			const change: PhaseChange = { from, to };
			if (!allowed) {
				const rejection: Rejection = {
					code: "invalid_transition",
					message: `Transição inválida: ${from} → ${to} (action ${action.type})`,
					applied: policy === "apply-and-report",
					from,
					to,
				};
				if (policy === "reject") {
					return { state, handler: handler.id, rejection };
				}
				return { state: applied, handler: handler.id, change, rejection };
			}

			let next = applied;
			for (const h of handlers) {
				if (h.onExit && appliesTo(h, from) && !appliesTo(h, to)) {
					next = h.onExit(next, env);
				}
			}
			for (const h of handlers) {
				if (h.onEnter && appliesTo(h, to) && !appliesTo(h, from)) {
					next = h.onEnter(next, env);
				}
			}
			return { state: next, handler: handler.id, change };
		},
	};
	return flow;
}

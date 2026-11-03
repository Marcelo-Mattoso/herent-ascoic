import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";
import {
	applyAction,
	engine,
	type GoldenSetup,
	initialState,
	stableStringify,
	startAction,
} from "../golden/lib";
import { type BotObservation, observe } from "./observe";

export type { AbilityMove, BotObservation } from "./observe";

export type ActResult =
	| { readonly kind: "applied" }
	| { readonly kind: "no_effect" }
	| { readonly kind: "rejected"; readonly error: string };

export interface BotPort {
	observe(): BotObservation;
	act(action: Action): ActResult;
}

/** Estado inteiro sem logs: duas escolhas seguidas podem deixar a tela idêntica. */
function fingerprint(state: GameState): string {
	const { alphaLog: _a, eventLog: _e, actionLog: _l, ...game } = state.game;
	return stableStringify({ engine: { ...state.engine, events: [] }, game });
}

export interface HeadlessBotPort extends BotPort {
	/** Só para o verificador de invariantes; a IA recebe apenas `BotPort`. */
	inspect(): GameState;
	readonly history: readonly Action[];
}

export function createHeadlessPort(setup: GoldenSetup): HeadlessBotPort {
	const start = startAction(setup);
	let state = applyAction(initialState(setup), start);
	const history: Action[] = [start];
	return {
		history,
		inspect: () => state,
		observe: () => observe(engine, state),
		act(action) {
			let next: GameState;
			try {
				next = applyAction(state, action);
			} catch (e) {
				return {
					kind: "rejected",
					error: e instanceof Error ? e.message : String(e),
				};
			}
			if (fingerprint(next) === fingerprint(state)) return { kind: "no_effect" };
			state = next;
			history.push(action);
			return { kind: "applied" };
		},
	};
}

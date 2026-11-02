import type { PlayerId } from "./events";

export type PriorityPolicy = "active-first" | "fixed" | readonly PlayerId[];

export interface TurnState {
	readonly order: readonly PlayerId[];
	readonly phases: readonly string[];
	readonly priority: PriorityPolicy;
	readonly active: number;
	readonly phase: number;
	readonly turn: number;
	readonly round: number;
}

export interface TurnConfig {
	readonly order: readonly PlayerId[];
	readonly phases: readonly string[];
	readonly priority?: PriorityPolicy;
}

export const NO_TURNS: TurnState = {
	order: [],
	phases: [],
	priority: "active-first",
	active: 0,
	phase: 0,
	turn: 0,
	round: 0,
};

export function priorityOrder(turn: TurnState): readonly PlayerId[] {
	if (turn.priority === "fixed") return turn.order;
	if (turn.priority !== "active-first") return turn.priority;
	return [
		...turn.order.slice(turn.active),
		...turn.order.slice(0, turn.active),
	];
}

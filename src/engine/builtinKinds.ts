import { z } from "zod";
import {
	type DslKind,
	defineTypedKind,
	type KindNode,
	type KindPackage,
} from "./kinds";
import {
	addToCounter,
	type CounterRef,
	counterOf,
	drawCards,
	type EngineEventMap,
	type GameState,
	moveCard,
	cardsOf,
	rollInto,
} from "./state";

export interface BuiltinCtx {
	readonly cause?: number;
}

const NodeLike = z.looseObject({ kind: z.string().min(1) });
const NodeList = z.array(NodeLike);
const CounterSchema = z.object({
	scope: z.string(),
	id: z.string(),
	name: z.string(),
});

type Node<T> = KindNode & T;

export function engineBuiltinKinds<
	TGame,
	TMap extends EngineEventMap = EngineEventMap,
>(): KindPackage<GameState<TGame, TMap>, BuiltinCtx> {
	type S = GameState<TGame, TMap>;
	const define = <T extends object>(
		definition: DslKind<S, BuiltinCtx, Node<T>>,
	) => defineTypedKind<Node<T>, S, BuiltinCtx>(definition);
	const meta = (ctx: BuiltinCtx) => ({ cause: ctx.cause });

	const noop = define<object>({
		kind: "noop",
		category: "effect",
		schema: z.object({ kind: z.literal("noop") }),
		resolve: (state) => ({ state }),
	});

	const moveCardKind = define<{ card: string; from: string; to: string }>({
		kind: "move_card",
		category: "effect",
		schema: z.object({
			kind: z.literal("move_card"),
			card: z.string(),
			from: z.string(),
			to: z.string(),
		}),
		resolve: (state, node, ctx) => ({
			state: {
				...state,
				engine: moveCard(
					state.engine,
					node.card,
					node.from,
					node.to,
					meta(ctx),
				),
			},
		}),
	});

	const draw = define<{
		from: string;
		to: string;
		count: number;
		onEmpty?: "error" | "stop";
	}>({
		kind: "draw_cards",
		category: "effect",
		vocabulary: { onEmpty: ["error", "stop"] },
		schema: z.object({
			kind: z.literal("draw_cards"),
			from: z.string(),
			to: z.string(),
			count: z.number().int().min(1),
			onEmpty: z.enum(["error", "stop"]).optional(),
		}),
		resolve: (state, node) => ({
			state: {
				...state,
				engine: drawCards(state.engine, node.from, node.to, node.count, {
					onEmpty: node.onEmpty ?? "error",
				}),
			},
		}),
	});

	const discard = define<{ from: string; to: string; count: number }>({
		kind: "discard_cards",
		category: "effect",
		schema: z.object({
			kind: z.literal("discard_cards"),
			from: z.string(),
			to: z.string(),
			count: z.number().int().min(1),
		}),
		resolve: (state, node, ctx) => {
			let engine = state.engine;
			for (const card of cardsOf(engine, node.from).slice(0, node.count)) {
				engine = moveCard(engine, card, node.from, node.to, meta(ctx));
			}
			return { state: { ...state, engine } };
		},
	});

	const changeCounter = define<{ counter: CounterRef; delta: number }>({
		kind: "change_counter",
		category: "effect",
		schema: z.object({
			kind: z.literal("change_counter"),
			counter: CounterSchema,
			delta: z.number().int(),
		}),
		resolve: (state, node, ctx) => ({
			state: {
				...state,
				engine: addToCounter(state.engine, node.counter, node.delta, meta(ctx)),
			},
		}),
	});

	const rollDie = define<{ faces: number; counter?: CounterRef }>({
		kind: "roll_die",
		category: "effect",
		schema: z.object({
			kind: z.literal("roll_die"),
			faces: z.number().int().min(2),
			counter: CounterSchema.optional(),
		}),
		resolve: (state, node, ctx) => {
			const rolled = rollInto(state.engine, node.faces, meta(ctx));
			const engine = node.counter
				? addToCounter(rolled.state, node.counter, rolled.value, meta(ctx))
				: rolled.state;
			return { state: { ...state, engine } };
		},
	});

	const repeat = define<{ times: number; do: readonly KindNode[] }>({
		kind: "repeat",
		category: "effect",
		schema: z.object({
			kind: z.literal("repeat"),
			times: z.number().int().min(0),
			do: NodeList,
		}),
		children: (node) => node.do,
		resolve: (state, node) => ({
			state,
			push: Array.from({ length: node.times }, () => node.do).flat(),
		}),
	});

	const ifCounter = define<{
		counter: CounterRef;
		op: "lt" | "lte" | "eq" | "gte" | "gt";
		value: number;
		then: readonly KindNode[];
		else?: readonly KindNode[];
	}>({
		kind: "if_counter",
		category: "effect",
		vocabulary: { op: ["lt", "lte", "eq", "gte", "gt"] },
		schema: z.object({
			kind: z.literal("if_counter"),
			counter: CounterSchema,
			op: z.enum(["lt", "lte", "eq", "gte", "gt"]),
			value: z.number(),
			then: NodeList,
			else: NodeList.optional(),
		}),
		children: (node) => [...node.then, ...(node.else ?? [])],
		resolve: (state, node) => {
			const current = counterOf(state.engine, node.counter);
			const holds = {
				lt: current < node.value,
				lte: current <= node.value,
				eq: current === node.value,
				gte: current >= node.value,
				gt: current > node.value,
			}[node.op];
			return { state, push: holds ? node.then : (node.else ?? []) };
		},
	});

	const chooseOne = define<{
		options: readonly { id: string; do: readonly KindNode[] }[];
	}>({
		kind: "choose_one",
		category: "effect",
		schema: z.object({
			kind: z.literal("choose_one"),
			options: z.array(z.object({ id: z.string(), do: NodeList })).min(2),
		}),
		children: (node) => node.options.flatMap((option) => option.do),
		resolve: (state, node) => ({
			state,
			pending: {
				id: "choose_one",
				options: node.options.map((option) => option.id),
				data: {
					options: node.options,
					branches: Object.fromEntries(
						node.options.map((option) => [option.id, option.do]),
					),
				},
			},
		}),
	});

	return {
		id: "engine-builtin",
		kinds: [
			noop,
			moveCardKind,
			draw,
			discard,
			changeCounter,
			rollDie,
			repeat,
			ifCounter,
			chooseOne,
		] as unknown as KindPackage<S, BuiltinCtx>["kinds"],
	};
}

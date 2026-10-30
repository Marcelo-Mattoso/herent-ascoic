import { describe, expect, it } from "vitest";
import {
	ANY_PHASE,
	createPhaseFlow,
	type PhaseHandler,
	transitionsFromMap,
} from "./phases";

interface Mini {
	readonly phase: string;
	readonly log: readonly string[];
	readonly gate?: boolean;
}

type MiniAction =
	| { type: "go"; to: string }
	| { type: "ping" }
	| { type: "reset" }
	| { type: "wait" };

const note = (state: Mini, text: string): Mini => ({
	...state,
	log: [...state.log, text],
});

const first: PhaseHandler<Mini, MiniAction> = {
	id: "first",
	phases: ["a", "b"],
	actions: ["go", "ping", "reset"],
	legalActions: (state) =>
		state.phase === "a"
			? [{ type: "go", to: "b" }, { type: "ping" }]
			: [{ type: "go", to: "c" }],
	apply(state, action) {
		if (action.type === "go") return { ...state, phase: action.to };
		if (action.type === "reset") return { ...state, phase: "a" };
		return note(state, "ping:first");
	},
	onExit: (state) => note(state, "exit:first"),
};

const second: PhaseHandler<Mini, MiniAction> = {
	id: "second",
	phases: ["c"],
	actions: ["go", "ping"],
	legalActions: () => [{ type: "ping" }],
	apply(state, action) {
		return action.type === "go"
			? { ...state, phase: action.to }
			: note(state, "ping:second");
	},
	onEnter: (state) => note(state, "enter:second"),
};

const modal: PhaseHandler<Mini, MiniAction> = {
	id: "modal",
	phases: ANY_PHASE,
	exclusive: true,
	actions: ["wait"],
	blocks: (state, action) => state.gate === true && action.type !== "wait",
	legalActions: (state) => (state.gate ? [{ type: "wait" }] : []),
	apply: (state) => ({ ...state, gate: false }),
};

const transitions = transitionsFromMap<Mini, MiniAction>({
	a: ["b"],
	b: ["c", "a"],
	c: [],
});

const flow = createPhaseFlow<Mini, MiniAction>({
	phaseOf: (state) => state.phase,
	handlers: [modal, first, second],
	transitions: [...transitions, { from: ANY_PHASE, on: "reset", to: "a" }],
});

const start: Mini = { phase: "a", log: [] };

describe("PhaseFlow", () => {
	it("roteia a action para o handler da fase e aplica a transição", () => {
		const result = flow.dispatch(start, { type: "ping" }, undefined);
		expect(result.handler).toBe("first");
		expect(result.state.log).toEqual(["ping:first"]);
		const moved = flow.dispatch(start, { type: "go", to: "b" }, undefined);
		expect(moved.change).toEqual({ from: "a", to: "b" });
		expect(moved.rejection).toBeUndefined();
	});

	it("escolhe entre handlers da mesma action pela fase atual", () => {
		const inC = { phase: "c", log: [] };
		expect(flow.dispatch(inC, { type: "ping" }, undefined).handler).toBe(
			"second",
		);
	});

	it("rejeita transição inválida sem lançar e sem alterar o estado", () => {
		const result = flow.dispatch(start, { type: "go", to: "c" }, undefined);
		expect(result.rejection).toMatchObject({
			code: "invalid_transition",
			from: "a",
			to: "c",
			applied: false,
		});
		expect(result.rejection?.message).toContain("a → c");
		expect(result.state).toBe(start);
	});

	it("política apply-and-report aplica o estado e reporta", () => {
		const lenient = createPhaseFlow<Mini, MiniAction>({
			phaseOf: (state) => state.phase,
			handlers: [first],
			transitions,
			onInvalidTransition: "apply-and-report",
		});
		const result = lenient.dispatch(start, { type: "go", to: "c" }, undefined);
		expect(result.rejection?.applied).toBe(true);
		expect(result.state.phase).toBe("c");
		expect(result.change).toEqual({ from: "a", to: "c" });
	});

	it("action sem handler é rejeitada", () => {
		const result = flow.dispatch(start, { type: "nope" } as never, undefined);
		expect(result.rejection?.code).toBe("unhandled");
		expect(result.state).toBe(start);
	});

	it("onExit e onEnter só disparam ao cruzar a fronteira de um handler", () => {
		const toB = flow.dispatch(start, { type: "go", to: "b" }, undefined).state;
		expect(toB.log).toEqual([]);
		const toC = flow.dispatch(toB, { type: "go", to: "c" }, undefined).state;
		expect(toC.log).toEqual(["exit:first", "enter:second"]);
	});

	it("handler modal bloqueia as demais actions e domina legalActions", () => {
		const gated: Mini = { ...start, gate: true };
		expect(flow.legalActions(gated, "p", undefined)).toEqual([
			{ type: "wait" },
		]);
		const blocked = flow.dispatch(gated, { type: "ping" }, undefined);
		expect(blocked.rejection?.code).toBe("blocked");
		expect(blocked.state).toBe(gated);
		expect(flow.dispatch(gated, { type: "wait" }, undefined).state.gate).toBe(
			false,
		);
	});

	it("legalActions vêm do handler da fase", () => {
		expect(flow.legalActions(start, "p", undefined)).toEqual([
			{ type: "go", to: "b" },
			{ type: "ping" },
		]);
		expect(flow.legalActions({ phase: "c", log: [] }, "p", undefined)).toEqual([
			{ type: "ping" },
		]);
	});

	it("tabela: canTransition e targetsFrom, com coringa por action", () => {
		expect(flow.canTransition("a", "b")).toBe(true);
		expect(flow.canTransition("a", "c")).toBe(false);
		expect(flow.canTransition("c", "a")).toBe(false);
		expect(flow.canTransition("c", "a", "reset")).toBe(true);
		expect(flow.targetsFrom("b")).toEqual(["c", "a"]);
	});

	it("recusa handlers duplicados ou sem actions", () => {
		expect(() =>
			createPhaseFlow<Mini, MiniAction>({
				phaseOf: (state) => state.phase,
				handlers: [first, first],
				transitions,
			}),
		).toThrow(/duplicado/);
		expect(() =>
			createPhaseFlow<Mini, MiniAction>({
				phaseOf: (state) => state.phase,
				handlers: [{ ...first, id: "vazio", actions: [] }],
				transitions,
			}),
		).toThrow(/sem actions/);
	});
});

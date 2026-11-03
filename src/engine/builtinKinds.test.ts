import { describe, expect, it } from "vitest";
import { engineBuiltinKinds } from "./builtinKinds";
import { remainingScripted, scriptedDice } from "./dice";
import { createKindRegistryFrom, type KindNode } from "./kinds";
import { cardsOf, counterOf, createEngineState, type GameState } from "./state";

type S = GameState<null>;
const PTS = { scope: "g", id: "-", name: "pts" };

const registry = createKindRegistryFrom<S, { cause?: number }>(
	engineBuiltinKinds<null>(),
);

function inicial(dados: readonly number[] = []): S {
	return {
		game: null,
		engine: createEngineState({
			dice: scriptedDice(dados),
			cards: ["a", "b", "c"].map((id) => ({ id, defId: id })),
			zones: [
				{ id: "pilha", cards: ["a", "b", "c"] },
				{ id: "mao" },
				{ id: "lixo" },
			],
			counters: [{ ...PTS, value: 10 }],
		}),
	};
}

const run = (state: S, ...nodes: KindNode[]) =>
	registry.runAll(state, nodes, { cause: 7 });

describe("kinds genéricos da engine", () => {
	it("registra todos como efeito", () => {
		expect(registry.kinds()).toEqual([
			"noop",
			"move_card",
			"draw_cards",
			"discard_cards",
			"change_counter",
			"roll_die",
			"repeat",
			"if_counter",
			"choose_one",
		]);
		for (const kind of registry.kinds()) {
			expect(registry.categoryOf(kind)).toBe("effect");
		}
	});

	it("noop não altera o estado", () => {
		const state = inicial();
		expect(run(state, { kind: "noop" }).state).toBe(state);
	});

	it("move_card move a instância e registra a causa", () => {
		const { state } = run(inicial(), {
			kind: "move_card",
			card: "b",
			from: "pilha",
			to: "mao",
		});
		expect(cardsOf(state.engine, "mao")).toEqual(["b"]);
		expect(cardsOf(state.engine, "pilha")).toEqual(["a", "c"]);
		expect(state.engine.events[0]?.cause).toBe(7);
	});

	it("draw_cards compra do topo; zona vazia falha ou para conforme onEmpty", () => {
		const { state } = run(inicial(), {
			kind: "draw_cards",
			from: "pilha",
			to: "mao",
			count: 2,
		});
		expect(cardsOf(state.engine, "mao")).toEqual(["a", "b"]);
		expect(() =>
			run(inicial(), {
				kind: "draw_cards",
				from: "pilha",
				to: "mao",
				count: 4,
			}),
		).toThrow(/vazia/);
		const parou = run(inicial(), {
			kind: "draw_cards",
			from: "pilha",
			to: "mao",
			count: 4,
			onEmpty: "stop",
		});
		expect(cardsOf(parou.state.engine, "mao")).toEqual(["a", "b", "c"]);
		expect(registry.vocabularyOf("draw_cards")).toEqual({
			onEmpty: ["error", "stop"],
		});
	});

	it("discard_cards move as primeiras cartas da zona", () => {
		const { state } = run(inicial(), {
			kind: "discard_cards",
			from: "pilha",
			to: "lixo",
			count: 2,
		});
		expect(cardsOf(state.engine, "lixo")).toEqual(["a", "b"]);
		expect(cardsOf(state.engine, "pilha")).toEqual(["c"]);
	});

	it("change_counter soma ao contador", () => {
		const { state } = run(inicial(), {
			kind: "change_counter",
			counter: PTS,
			delta: -3,
		});
		expect(counterOf(state.engine, PTS)).toBe(7);
	});

	it("roll_die rola o dado roteirizado e soma ao contador quando pedido", () => {
		const { state } = run(
			inicial([4, 6]),
			{ kind: "roll_die", faces: 6 },
			{ kind: "roll_die", faces: 6, counter: PTS },
		);
		expect(counterOf(state.engine, PTS)).toBe(16);
		expect(remainingScripted(state.engine.dice)).toBe(0);
		expect(state.engine.events.map((e) => e.type)).toEqual([
			"dado.rolado",
			"dado.rolado",
			"contador.alterado",
		]);
	});

	it("repeat empilha o corpo N vezes", () => {
		const { state } = run(inicial(), {
			kind: "repeat",
			times: 3,
			do: [{ kind: "change_counter", counter: PTS, delta: 2 }],
		});
		expect(counterOf(state.engine, PTS)).toBe(16);
		expect(
			counterOf(
				run(inicial(), { kind: "repeat", times: 0, do: [] }).state.engine,
				PTS,
			),
		).toBe(10);
	});

	it("if_counter escolhe o ramo pelo valor do contador", () => {
		const node = (op: "gte" | "lt"): KindNode => ({
			kind: "if_counter",
			counter: PTS,
			op,
			value: 10,
			then: [{ kind: "change_counter", counter: PTS, delta: 1 }],
			else: [{ kind: "change_counter", counter: PTS, delta: -1 }],
		});
		expect(counterOf(run(inicial(), node("gte")).state.engine, PTS)).toBe(11);
		expect(counterOf(run(inicial(), node("lt")).state.engine, PTS)).toBe(9);
		expect(
			counterOf(
				run(inicial(), {
					kind: "if_counter",
					counter: PTS,
					op: "lt",
					value: 0,
					then: [],
				}).state.engine,
				PTS,
			),
		).toBe(10);
	});

	it("choose_one pausa com as opções e devolve o que faltava", () => {
		const outcome = run(
			inicial(),
			{
				kind: "choose_one",
				options: [
					{ id: "x", do: [{ kind: "noop" }] },
					{ id: "y", do: [{ kind: "noop" }] },
				],
			},
			{ kind: "change_counter", counter: PTS, delta: 1 },
		);
		expect(outcome.pending).toMatchObject({
			id: "choose_one",
			options: ["x", "y"],
		});
		expect(outcome.stack).toEqual([
			{ kind: "change_counter", counter: PTS, delta: 1 },
		]);
	});

	it("validate percorre repeat, if_counter e choose_one", () => {
		expect(() =>
			registry.validate({
				kind: "repeat",
				times: 1,
				do: [
					{
						kind: "if_counter",
						counter: PTS,
						op: "gt",
						value: 1,
						then: [{ kind: "voar" }],
					},
				],
			}),
		).toThrow(/repeat\[0\] > if_counter\[0\]: kind "voar" sem implementação/);
		expect(() =>
			registry.validate({
				kind: "choose_one",
				options: [{ id: "so-uma", do: [] }],
			}),
		).toThrow(/inválido/);
	});
});

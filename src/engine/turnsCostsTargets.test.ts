import { describe, expect, it } from "vitest";
import { z } from "zod";
import { answerPending, openChoice, runWithChoices } from "./choice";
import {
	checkCosts,
	gainPool,
	payCosts,
	poolOf,
	requirementCost,
	resourceCost,
} from "./cost";
import { scriptedDice } from "./dice";
import { createKindRegistry, defineKind } from "./kinds";
import { createScopeRegistry, ENGINE_SCOPES } from "./scopes";
import {
	addToCounter,
	controllerOf,
	createEngineState,
	type EngineState,
	type GameState,
	setController,
} from "./state";
import {
	checkTargets,
	declareTargets,
	legalTargets,
	resolveTargeted,
	type TargetSelector,
	validateSelector,
} from "./targets";
import { priorityOrder } from "./turn";
import {
	activePlayer,
	advancePhase,
	clearScope,
	configureTurns,
	currentPhase,
	endTurn,
	startTurns,
} from "./turns";

const base = (): EngineState =>
	createEngineState({
		dice: scriptedDice([]),
		players: ["p1", "p2", "p3"],
		cards: [
			{ id: "c1", defId: "x", owner: "p1" },
			{ id: "c2", defId: "y", owner: "p2" },
			{ id: "c3", defId: "x", owner: "p3" },
		],
		zones: [{ id: "mesa", cards: ["c1", "c2", "c3"] }, { id: "lixo" }],
	});

const withTurns = () =>
	startTurns(
		configureTurns(base(), { order: ["p1", "p2", "p3"], phases: ["a", "b"] }),
	);

describe("escopos", () => {
	it("registra, aninha e recusa inválidos", () => {
		const scopes = createScopeRegistry(ENGINE_SCOPES);
		expect(scopes.ids()).toEqual(["round", "turn", "phase"]);
		expect(scopes.isWithin("phase", "round")).toBe(true);
		expect(scopes.isWithin("round", "phase")).toBe(false);
		expect(scopes.parentOf("turn")).toBe("round");
		expect(() => scopes.assert("jogo")).toThrow(/Escopo desconhecido/);
		expect(() => createScopeRegistry([{ id: "a" }, { id: "a" }])).toThrow(
			/duplicado/,
		);
		expect(() => createScopeRegistry([{ id: "a", within: "z" }])).toThrow(
			/não registrado/,
		);
		expect(() =>
			createScopeRegistry([
				{ id: "a", within: "b" },
				{ id: "b", within: "a" },
			]),
		).toThrow(/ciclo/);
		expect(() => createScopeRegistry([{ id: "a:b" }])).toThrow(/inválido/);
	});

	it("jogo registra os seus escopos além dos da engine", () => {
		const scopes = createScopeRegistry([...ENGINE_SCOPES, { id: "partida" }]);
		expect(scopes.has("partida")).toBe(true);
	});
});

describe("jogadores e turnos", () => {
	it("rotaciona jogadores, etapas e rodadas", () => {
		let s = withTurns();
		expect([activePlayer(s), currentPhase(s)]).toEqual(["p1", "a"]);
		s = advancePhase(s);
		expect([activePlayer(s), currentPhase(s)]).toEqual(["p1", "b"]);
		s = advancePhase(s);
		expect([activePlayer(s), currentPhase(s), s.turn.turn]).toEqual([
			"p2",
			"a",
			2,
		]);
		s = endTurn(endTurn(s));
		expect([activePlayer(s), s.turn.round, s.turn.turn]).toEqual(["p1", 2, 4]);
		expect(s.events.map((e) => e.type)).toContain("turno.encerrado");
	});

	it("prioridade é configurável", () => {
		const s = endTurn(withTurns());
		expect(priorityOrder(s.turn)).toEqual(["p2", "p3", "p1"]);
		const fixed = configureTurns(base(), {
			order: ["p1", "p2", "p3"],
			phases: ["a"],
			priority: "fixed",
		});
		expect(priorityOrder(endTurn(startTurns(fixed)).turn)).toEqual([
			"p1",
			"p2",
			"p3",
		]);
		const custom = configureTurns(base(), {
			order: ["p1", "p2", "p3"],
			phases: ["a"],
			priority: ["p3", "p1", "p2"],
		});
		expect(priorityOrder(startTurns(custom).turn)).toEqual(["p3", "p1", "p2"]);
	});

	it("valida a configuração", () => {
		const cfg = { order: ["p1"], phases: ["a"] };
		expect(() => configureTurns(base(), { ...cfg, order: [] })).toThrow(
			/vazia/,
		);
		expect(() => configureTurns(base(), { ...cfg, phases: [] })).toThrow(
			/sem etapas/,
		);
		expect(() =>
			configureTurns(base(), { ...cfg, order: ["p1", "p1"] }),
		).toThrow(/repetido/);
		expect(() => configureTurns(base(), { ...cfg, order: ["zz"] })).toThrow(
			/desconhecido/,
		);
		expect(() => configureTurns(base(), { ...cfg, priority: ["p9"] })).toThrow(
			/Prioridade/,
		);
		expect(() => startTurns(base())).toThrow(/não configurados/);
		expect(() => startTurns(withTurns())).toThrow(/já iniciados/);
		expect(() => endTurn(base())).toThrow(/não iniciados/);
		expect(() => advancePhase(base())).toThrow(/não iniciados/);
		expect(() => activePlayer(base())).toThrow(/não configurados/);
	});

	it("contadores de escopo expiram ao fim da etapa, turno e rodada", () => {
		const scopes = createScopeRegistry(ENGINE_SCOPES);
		const ref = (scope: string) => ({ scope, id: "p1", name: "n" });
		let s = withTurns();
		for (const scope of ["phase", "turn", "round", "player"]) {
			s = addToCounter(s, ref(scope), 1);
		}
		s = advancePhase(s, scopes);
		expect(Object.keys(s.counters).sort()).toEqual([
			"player:p1:n",
			"round:p1:n",
			"turn:p1:n",
		]);
		s = advancePhase(s, scopes);
		expect(Object.keys(s.counters).sort()).toEqual([
			"player:p1:n",
			"round:p1:n",
		]);
		s = endTurn(endTurn(s, scopes), scopes);
		expect(Object.keys(s.counters)).toEqual(["player:p1:n"]);
		expect(() => clearScope(s, scopes, "nada")).toThrow(/desconhecido/);
	});

	it("controle difere do dono e muda com evento", () => {
		let s = base();
		expect(controllerOf(s, "c1")).toBe("p1");
		s = setController(s, "c1", "p2");
		expect(controllerOf(s, "c1")).toBe("p2");
		expect(s.cards.c1.owner).toBe("p1");
		expect(s.events.at(-1)).toMatchObject({
			type: "controle.alterado",
			payload: { card: "c1", from: "p1", to: "p2" },
		});
		expect(() => setController(s, "c1", "zz")).toThrow(/Jogador desconhecido/);
	});

	it("sem dono nem controlador, vale o dono da zona", () => {
		const s = createEngineState({
			dice: scriptedDice([]),
			players: ["p1"],
			cards: [{ id: "k", defId: "x" }],
			zones: [{ id: "mao", owner: "p1", cards: ["k"] }],
		});
		expect(controllerOf(s, "k")).toBe("p1");
	});
});

describe("custos e recursos", () => {
	it("pools por jogador, canPay e pay", () => {
		let s = gainPool(base(), "p1", "mana", 3);
		expect(poolOf(s, "p1", "mana")).toBe(3);
		expect(poolOf(s, "p2", "mana")).toBe(0);
		const custo = resourceCost("mana", 2);
		expect(custo.canPay(s, "p1")).toEqual({ ok: true });
		expect(custo.canPay(s, "p2")).toMatchObject({ ok: false });
		s = payCosts([custo], s, "p1");
		expect(poolOf(s, "p1", "mana")).toBe(1);
		expect(() => payCosts([custo], s, "p1")).toThrow(/Custo não pago/);
		expect(() => resourceCost("mana", -1)).toThrow(/inválido/);
	});

	it("combina custos e para no primeiro que falha", () => {
		const s = gainPool(base(), "p1", "mana", 5);
		const exige = requirementCost<EngineState>(
			"req",
			() => false,
			"falta requisito",
		);
		const check = checkCosts(
			[resourceCost("mana", 1), exige, resourceCost("ouro", 1)],
			s,
			"p1",
		);
		expect(check).toEqual({ ok: false, reason: "falta requisito" });
		expect(checkCosts([resourceCost("mana", 5)], s, "p1")).toEqual({
			ok: true,
		});
	});
});

describe("alvos", () => {
	const seletor: TargetSelector = {
		id: "adversario",
		zones: ["mesa"],
		controller: "opponent",
		defIds: ["x"],
		min: 1,
		max: 2,
	};
	const livre: TargetSelector = {
		...seletor,
		controller: "any",
		defIds: undefined,
	};

	it("filtra por zona, controlador e definição", () => {
		const s = base();
		expect(legalTargets(s, seletor, "p1")).toEqual(["c3"]);
		expect(legalTargets(s, { ...seletor, controller: "self" }, "p1")).toEqual([
			"c1",
		]);
		expect(legalTargets(s, livre, "p1")).toEqual(["c1", "c2", "c3"]);
		expect(legalTargets(s, livre, "p1", (card) => card.id !== "c1")).toEqual([
			"c2",
			"c3",
		]);
	});

	it("valida seletor, cardinalidade e repetição na declaração", () => {
		const s = base();
		expect(() => validateSelector({ ...seletor, zones: [] })).toThrow(
			/sem zonas/,
		);
		expect(() => validateSelector({ ...seletor, id: "" })).toThrow(/id vazio/);
		expect(() => validateSelector({ ...seletor, min: 2, max: 1 })).toThrow(
			/max menor/,
		);
		expect(() => validateSelector({ ...seletor, min: -1 })).toThrow(
			/min inválido/,
		);
		expect(() => validateSelector({ ...seletor, zones: ["nada"] }, s)).toThrow(
			/zona desconhecida/,
		);
		expect(checkTargets(s, seletor, "p1", [])).toMatchObject({ ok: false });
		expect(checkTargets(s, livre, "p1", ["c1", "c1"])).toMatchObject({
			ok: false,
			reason: "alvo repetido",
		});
		expect(() => declareTargets(s, seletor, "p1", ["c2"])).toThrow(
			/alvo ilegal/,
		);
		expect(declareTargets(s, seletor, "p1", ["c3"]).targets).toEqual(["c3"]);
	});

	it("alvo que sai de jogo antes da resolução faz o efeito falhar com evento", () => {
		let s = base();
		const declaracao = declareTargets(s, seletor, "p1", ["c3"]);
		const aplicar = (e: EngineState, alvos: readonly string[]) => ({
			...e,
			counters: { ...e.counters, aplicado: alvos.length },
		});
		expect(resolveTargeted(s, declaracao, aplicar).counters.aplicado).toBe(1);
		s = {
			...s,
			zones: { ...s.zones, mesa: { ...s.zones.mesa, cards: ["c1", "c2"] } },
		};
		const resolvido = resolveTargeted(s, declaracao, aplicar);
		expect(resolvido.counters.aplicado).toBeUndefined();
		expect(resolvido.events.at(-1)).toMatchObject({
			type: "alvo.ilegal",
			payload: { selector: "adversario", caster: "p1", targets: ["c3"] },
		});
	});
});

describe("escolhas", () => {
	type S = GameState<{ log: string[] }>;
	const marca = defineKind<
		S,
		object,
		z.ZodObject<{ kind: z.ZodLiteral<"marca">; v: z.ZodString }>
	>({
		kind: "marca",
		category: "effect",
		schema: z.object({ kind: z.literal("marca"), v: z.string() }),
		resolve: (state, node) => ({
			state: { ...state, game: { log: [...state.game.log, node.v] } },
		}),
	});
	const pergunta = defineKind<
		S,
		object,
		z.ZodObject<{ kind: z.ZodLiteral<"pergunta"> }>
	>({
		kind: "pergunta",
		category: "effect",
		schema: z.object({ kind: z.literal("pergunta") }),
		resolve: (state) => ({
			state,
			pending: {
				id: "q",
				options: ["x", "y", "z"],
				min: 1,
				max: 2,
				player: "p2",
				data: {
					branches: {
						x: [{ kind: "marca", v: "X" }],
						y: [{ kind: "marca", v: "Y" }],
					},
				},
			},
		}),
	});
	const registro = createKindRegistry<S, object>([marca, pergunta]);
	const inicio = (): S => ({ engine: withTurns(), game: { log: [] } });

	it("pausa pela pilha, guarda o resto e retoma ao responder", () => {
		const pausado = runWithChoices(
			registro,
			inicio(),
			[
				{ kind: "marca", v: "1" },
				{ kind: "pergunta" },
				{ kind: "marca", v: "2" },
			],
			{},
		);
		expect(pausado.game.log).toEqual(["1"]);
		expect(pausado.engine.pending?.choice).toMatchObject({
			id: "q",
			player: "p2",
			min: 1,
			max: 2,
		});
		expect(pausado.engine.pending?.stack).toEqual([{ kind: "marca", v: "2" }]);
		const retomado = answerPending(
			registro,
			pausado,
			{ choice: "q", player: "p2", picks: ["y", "x"] },
			{},
		);
		expect(retomado.game.log).toEqual(["1", "Y", "X", "2"]);
		expect(retomado.engine.pending).toBeUndefined();
		expect(retomado.engine.events.map((e) => e.type)).toEqual(
			expect.arrayContaining(["escolha.aberta", "escolha.respondida"]),
		);
	});

	it("valida jogador, quantidade, repetição e opção", () => {
		const pausado = runWithChoices(
			registro,
			inicio(),
			[{ kind: "pergunta" }],
			{},
		);
		const tenta =
			(answer: { choice?: string; player?: string; picks: string[] }) => () =>
				answerPending(
					registro,
					pausado,
					{ choice: "q", player: "p2", ...answer },
					{},
				);
		expect(tenta({ player: "p1", picks: ["x"] })).toThrow(/não decide/);
		expect(tenta({ choice: "w", picks: ["x"] })).toThrow(/pendente é/);
		expect(tenta({ picks: [] })).toThrow(/exige entre 1 e 2/);
		expect(tenta({ picks: ["x", "y", "z"] })).toThrow(/exige entre 1 e 2/);
		expect(tenta({ picks: ["x", "x"] })).toThrow(/repetida/);
		expect(tenta({ picks: ["w"] })).toThrow(/inexistente/);
		expect(() =>
			answerPending(
				registro,
				inicio(),
				{ choice: "q", player: "p2", picks: [] },
				{},
			),
		).toThrow(/Nenhuma escolha pendente/);
	});

	it("openChoice completa jogador ativo e limites e recusa dupla pendência", () => {
		const e = openChoice(withTurns(), { id: "c", options: ["a", "b"] }, []);
		expect(e.pending?.choice).toMatchObject({ player: "p1", min: 1, max: 1 });
		expect(() => openChoice(e, { id: "d", options: ["a"] }, [])).toThrow(
			/Já existe/,
		);
		expect(() =>
			openChoice(base(), { id: "c", options: ["a", "a"] }, []),
		).toThrow(/repetidas/);
		expect(() =>
			openChoice(base(), { id: "c", options: ["a"], min: 2 }, []),
		).toThrow(/limites/);
		expect(() =>
			openChoice(base(), { id: "c", options: ["a"], player: "zz" }, []),
		).toThrow(/desconhecido/);
		const sem = createEngineState({ dice: scriptedDice([]) });
		expect(() => openChoice(sem, { id: "c", options: ["a"] }, [])).toThrow(
			/sem jogador/,
		);
	});
});

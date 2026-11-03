import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	addCard,
	advancePhase,
	answerPendingBy,
	checkTargets,
	configureTurns,
	controllerOf,
	counterOf,
	createEngine,
	createEngineState,
	createKindRegistry,
	createKindRegistryFrom,
	createScopeRegistry,
	defineCondition,
	defineKind,
	engineOf,
	gameOf,
	id,
	instanceOf,
	type KindNode,
	lastEventOfType,
	legalTargets,
	moveCard,
	normalizeChoice,
	openChoice,
	orderEntries,
	payCosts,
	pendingChoiceOf,
	priorityOrder,
	project,
	pushEntry,
	remainingScripted,
	removeCard,
	reorderZone,
	requirementCost,
	resourceCost,
	roll,
	scriptedDice,
	seededDice,
	setController,
	spendPool,
	startTurns,
	validateAnswer,
	validateSelector,
	windowIsOpen,
	windowOf,
	withGame,
	zoneHolding,
	zoneOf,
	EMPTY_STACK,
	type GameState,
	endTurn,
	clearScope,
	shuffleWith,
	int,
	float,
	currentPhase,
	activePlayer,
	ENGINE_SCOPES,
} from "../../src/engine";

type S = GameState<{ rodada: number }>;
const PTS = { scope: "jogo", id: "-", name: "pts" };

function mesa(): S {
	return {
		game: { rodada: 0 },
		engine: createEngineState({
			dice: scriptedDice([]),
			players: ["p", "q"],
			cards: [
				{ id: "a", defId: "carta", owner: "p" },
				{ id: "b", defId: "carta", owner: "q" },
				{ id: "c", defId: "outra" },
			],
			zones: [
				{ id: "mao:p", owner: "p", visibility: "owner", cards: ["a"] },
				{ id: "mesa", cards: ["b", "c"] },
				{ id: "lixo" },
			],
			counters: [{ ...PTS, value: 2 }],
		}),
	};
}

const REFS: Record<string, number> = { $base: 5, $dobro: 10 };

describe("kinds: registro, aliases, referências e condições", () => {
	const somar = defineKind<
		S,
		{ cause?: number },
		z.ZodObject<{
			kind: z.ZodLiteral<"somar">;
			valor: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
		}>
	>({
		kind: "somar",
		category: "effect",
		aliases: ["add_pts"],
		vocabulary: { modo: ["a", "b"] },
		schema: z.object({
			kind: z.literal("somar"),
			valor: z.union([z.number(), z.string()]),
		}),
		refsOf: (node) =>
			typeof node.valor === "string"
				? [{ space: "valor", ref: node.valor }]
				: [],
		targets: () => ["c"],
		evaluate: (node, ctx) => ({ ...mesa(), game: { rodada: Number(node.valor) + ctx.cause! } }),
		resolve: (state, node) => {
			const valor = typeof node.valor === "string" ? REFS[node.valor] : node.valor;
			return {
				state: {
					...state,
					engine: {
						...state.engine,
						counters: {
							...state.engine.counters,
							"jogo:-:pts": counterOf(state.engine, PTS) + valor,
						},
					},
				},
			};
		},
	});

	const duas = defineKind<
		S,
		{ cause?: number },
		z.ZodObject<{ kind: z.ZodLiteral<"duas">; do: z.ZodArray<z.ZodAny> }>
	>({
		kind: "duas",
		category: "effect",
		schema: z.object({ kind: z.literal("duas"), do: z.array(z.any()) }),
		children: (node) => node.do as KindNode[],
		resolve: (state, node) => ({ state, push: [...node.do, ...node.do] as KindNode[] }),
	});

	const ciclo = defineKind<
		S,
		{ cause?: number },
		z.ZodObject<{ kind: z.ZodLiteral<"ciclo"> }>
	>({
		kind: "ciclo",
		category: "effect",
		schema: z.object({ kind: z.literal("ciclo") }),
		resolve: (state) => ({ state, push: [{ kind: "ciclo" }] }),
	});

	const maiorQue = defineCondition<S, { cause?: number }, { pts: number }>({
		kind: "pts_maior",
		schema: z.looseObject({ kind: z.literal("pts_maior"), valor: z.number() }),
		test: (node, ctx) => ctx.pts > (node as unknown as { valor: number }).valor,
	});

	const registro = createKindRegistryFrom<S, { cause?: number }, { pts: number }>({
		id: "mini",
		kinds: [somar, duas, ciclo, maiorQue] as never,
		refs: [
			{
				id: "base",
				space: "valor",
				priority: 1,
				resolve: (ref) => (ref === "$base" ? 5 : undefined),
			},
			{
				id: "dobro",
				space: "valor",
				priority: 0,
				resolve: (ref) => (ref === "$dobro" ? 10 : undefined),
			},
		],
	});

	it("expõe nomes, categorias, vocabulário e aliases", () => {
		expect(registro.kinds()).toEqual(["somar", "duas", "ciclo", "pts_maior"]);
		expect(registro.has("add_pts")).toBe(false);
		expect(registro.canResolve("add_pts")).toBe(true);
		expect(registro.canResolve("pts_maior")).toBe(false);
		expect(registro.canEvaluate("somar")).toBe(true);
		expect(registro.canEvaluate("duas")).toBe(false);
		expect(registro.categoryOf("pts_maior")).toBe("condition");
		expect(registro.categoryOf("nada")).toBeUndefined();
		expect(registro.vocabularyOf("somar")).toEqual({ modo: ["a", "b"] });
		expect(registro.vocabularyOf("duas")).toEqual({});
	});

	it("resolve por alias, por referência e empilha filhos", () => {
		const { state } = registro.runAll(mesa(), [
			{ kind: "add_pts", valor: 1 },
			{ kind: "somar", valor: "$base" },
			{ kind: "somar", valor: "$dobro" },
			{ kind: "duas", do: [{ kind: "somar", valor: 1 }] },
		], {});
		expect(counterOf(state.engine, PTS)).toBe(2 + 1 + 5 + 10 + 2);
		expect(registro.targets(mesa(), { kind: "somar", valor: 1 }, {})).toEqual(["c"]);
		expect(registro.ref<number>("valor", "$base", { pts: 0 })).toBe(5);
		expect(registro.ref<number>("valor", "$dobro", { pts: 0 })).toBe(10);
		expect(registro.ref("valor", "$nenhum", { pts: 0 })).toBeUndefined();
		expect(registro.targets(mesa(), { kind: "duas", do: [] }, {})).toEqual([]);
	});

	it("avalia nós e testa condições", () => {
		expect(registro.evaluate({ kind: "somar", valor: 4 }, { pts: 0, cause: 3 } as never).game.rodada).toBe(7);
		expect(registro.test({ kind: "pts_maior", valor: 3 }, { pts: 4 })).toBe(true);
		expect(registro.test({ kind: "pts_maior", valor: 9 }, { pts: 4 })).toBe(false);
		expect(() => registro.evaluate({ kind: "duas", do: [] }, { pts: 0 })).toThrow(
			/não tem evaluate/,
		);
		expect(() => registro.test({ kind: "somar", valor: 1 }, { pts: 0 })).toThrow(
			/não é uma condição/,
		);
		expect(() => registro.resolve(mesa(), { kind: "pts_maior" }, {})).toThrow(
			/não tem resolve/,
		);
	});

	it("valida payload, referências e filhos no carregamento", () => {
		expect(() => registro.validate({ kind: "somar", valor: "$base" })).not.toThrow();
		expect(() => registro.validate({ kind: "somar", valor: "$nenhum" })).toThrow(
			/sem resolvedor registrado/,
		);
		expect(() =>
			registro.validate({ kind: "duas", do: [{ kind: "somar", valor: {} }] }, "carta x"),
		).toThrow(/carta x > duas\[0\]: kind "somar" inválido/);
		expect(() => registro.validate({ kind: 5 } as never)).toThrow(/sem "kind" textual/);
		expect(() => registro.parse({ kind: "somar", valor: {} })).toThrow(/inválido/);
		expect(registro.parseAll([{ kind: "somar", valor: 1 }])).toHaveLength(1);
		expect(() => registro.parse({ kind: "x" })).toThrow(/Kind desconhecido/);
		expect(() => registro.resolve(mesa(), { kind: "x" }, {})).toThrow(
			/Kind desconhecido/,
		);
	});

	it("recusa laço infinito de kinds", () => {
		expect(() => registro.run(mesa(), { kind: "ciclo" }, {})).toThrow(/excedeu/);
	});

	it("recusa registros ambíguos", () => {
		expect(() => createKindRegistry([somar, somar] as never)).toThrow(/duplicado/);
		const conflito = defineKind<S, { cause?: number }, z.ZodObject<{ kind: z.ZodLiteral<"outro"> }>>({
			kind: "outro",
			category: "effect",
			aliases: ["add_pts"],
			schema: z.object({ kind: z.literal("outro") }),
		});
		expect(() => createKindRegistry([somar, conflito] as never)).toThrow(
			/já pertence/,
		);
		expect(() =>
			createKindRegistry([] as never, {
				refs: [
					{ id: "r", space: "s", resolve: () => 1 },
					{ id: "r", space: "s", resolve: () => 1 },
				],
			}),
		).toThrow(/RefResolver duplicado/);
	});
});

describe("estado: zonas, instâncias e controle", () => {
	it("cria e consulta o estado com acessores", () => {
		const s = mesa();
		expect(engineOf(s)).toBe(s.engine);
		expect(gameOf(s).rodada).toBe(0);
		expect(withGame(s, (g) => ({ rodada: g.rodada + 1 })).game.rodada).toBe(1);
		expect(() => zoneOf(s.engine, "inexistente")).toThrow(/Zona desconhecida/);
		expect(() => instanceOf(s.engine, "zzz")).toThrow(/Instância desconhecida/);
	});

	it("recusa montagens inconsistentes", () => {
		const base = { dice: scriptedDice([]) };
		expect(() =>
			createEngineState({ ...base, cards: [{ id: "a", defId: "x" }, { id: "a", defId: "x" }] }),
		).toThrow(/Instância duplicada/);
		expect(() =>
			createEngineState({ ...base, zones: [{ id: "z" }, { id: "z" }] }),
		).toThrow(/Zona duplicada/);
		expect(() =>
			createEngineState({ ...base, zones: [{ id: "z", cards: ["x"] }] }),
		).toThrow(/instância inexistente/);
		expect(() =>
			createEngineState({
				...base,
				cards: [{ id: "a", defId: "x" }],
				zones: [{ id: "z", cards: ["a"] }, { id: "w", cards: ["a"] }],
			}),
		).toThrow(/mais de uma zona/);
	});

	it("addCard, removeCard, reorderZone e zoneHolding mantêm a conservação", () => {
		let e = mesa().engine;
		e = addCard(e, { id: "d", defId: "nova" }, "lixo");
		expect(zoneHolding(e, "d")).toBe("lixo");
		expect(() => addCard(e, { id: "d", defId: "nova" }, "lixo")).toThrow(/duplicada/);
		e = reorderZone(e, "mesa", ["c", "b"]);
		expect(e.zones.mesa.cards).toEqual(["c", "b"]);
		expect(() => reorderZone(e, "mesa", ["c"])).toThrow(/não é permutação/);
		e = removeCard(e, "b");
		expect(zoneHolding(e, "b")).toBeUndefined();
		expect(e.zones.mesa.cards).toEqual(["c"]);
		expect(() => instanceOf(e, "b")).toThrow();
		const mesmo = moveCard(e, "c", "mesa", "mesa");
		expect(mesmo.zones.mesa.cards).toEqual(["c"]);
		expect(() => moveCard(e, "c", "lixo", "mesa")).toThrow(/não está na zona/);
	});

	it("owner x controller: cai para o dono, depois para o dono da zona", () => {
		const e = mesa().engine;
		expect(controllerOf(e, "a")).toBe("p");
		expect(controllerOf(e, "c")).toBeUndefined();
		const roubada = setController(e, "a", "q");
		expect(controllerOf(roubada, "a")).toBe("q");
		expect(lastEventOfType(roubada.events, "controle.alterado")?.payload).toEqual({
			card: "a",
			from: "p",
			to: "q",
		});
		const semDono = createEngineState({
			dice: scriptedDice([]),
			players: ["p"],
			cards: [{ id: "x", defId: "d" }],
			zones: [{ id: "mao", owner: "p", cards: ["x"] }],
		});
		expect(controllerOf(semDono, "x")).toBe("p");
		expect(() => setController(e, "a", "fantasma")).toThrow(/Jogador desconhecido/);
	});
});

describe("pilha, escopos, turnos e prioridade", () => {
	it("pushEntry numera e orderEntries aplica FIFO/LIFO", () => {
		let pilha = EMPTY_STACK;
		pilha = pushEntry(pilha, { cause: "dano", source: "x", effect: 1 });
		pilha = pushEntry(pilha, { cause: "cura", source: "y", effect: 2 });
		expect(pilha.pending.map((p) => p.id)).toEqual(["effect-0-dano", "effect-1-cura"]);
		expect(orderEntries(pilha.pending, "fifo").map((p) => p.effect)).toEqual([1, 2]);
		expect(orderEntries(pilha.pending, "lifo").map((p) => p.effect)).toEqual([2, 1]);
		const resolvendo = { ...pilha, resolving: pilha.pending[0] };
		expect(pushEntry(resolvendo, { cause: "z", source: "w", effect: 3 }).pending.at(-1)?.seq).toBe(3);
	});

	it("registro de escopos valida ids, ciclos e pais", () => {
		expect(createScopeRegistry().ids()).toEqual(ENGINE_SCOPES.map((s) => s.id));
		expect(() => createScopeRegistry([{ id: "" }])).toThrow(/inválido/);
		expect(() => createScopeRegistry([{ id: "a:b" }])).toThrow(/inválido/);
		expect(() => createScopeRegistry([{ id: "a" }, { id: "a" }])).toThrow(/duplicado/);
		expect(() => createScopeRegistry([{ id: "a", within: "b" }])).toThrow(/não registrado/);
		expect(() =>
			createScopeRegistry([{ id: "a", within: "b" }, { id: "b", within: "a" }]),
		).toThrow(/ciclo/);
		const r = createScopeRegistry();
		expect(r.parentOf("phase")).toBe("turn");
		expect(r.isWithin("phase", "round")).toBe(true);
		expect(r.isWithin("round", "phase")).toBe(false);
		expect(() => r.assert("nada")).toThrow(/Escopo desconhecido/);
	});

	it("turnos: validações, prioridade e limpeza de escopo", () => {
		const e = mesa().engine;
		expect(() => configureTurns(e, { order: [], phases: ["a"] })).toThrow(/vazia/);
		expect(() => configureTurns(e, { order: ["p"], phases: [] })).toThrow(/sem etapas/);
		expect(() => configureTurns(e, { order: ["p", "p"], phases: ["a"] })).toThrow(/repetido/);
		expect(() => configureTurns(e, { order: ["z"], phases: ["a"] })).toThrow(/desconhecido/);
		expect(() =>
			configureTurns(e, { order: ["p", "q"], phases: ["a"], priority: ["p"] }),
		).toThrow(/exatamente/);
		expect(() => startTurns(e)).toThrow(/não configurados/);
		expect(() => activePlayer(e)).toThrow(/não configurados/);
		expect(() => advancePhase(e)).toThrow(/não iniciados/);
		expect(() => endTurn(e)).toThrow(/não iniciados/);

		const fixa = startTurns(configureTurns(e, { order: ["p", "q"], phases: ["a", "b"], priority: "fixed" }));
		expect(() => startTurns(fixa)).toThrow(/já iniciados/);
		expect(priorityOrder(fixa.turn)).toEqual(["p", "q"]);
		const lista = startTurns(configureTurns(e, { order: ["p", "q"], phases: ["a"], priority: ["q", "p"] }));
		expect(priorityOrder(lista.turn)).toEqual(["q", "p"]);
		const ativa = endTurn(startTurns(configureTurns(e, { order: ["p", "q"], phases: ["a"] })));
		expect(priorityOrder(ativa.turn)).toEqual(["q", "p"]);

		const escopos = createScopeRegistry();
		let t = startTurns(configureTurns(e, { order: ["p", "q"], phases: ["a", "b"] }));
		t = { ...t, counters: { ...t.counters, "phase:p:x": 1, "turn:p:y": 1, "round:p:z": 1 } };
		expect(currentPhase(t)).toBe("a");
		t = advancePhase(t, escopos);
		expect(currentPhase(t)).toBe("b");
		expect(t.counters["phase:p:x"]).toBeUndefined();
		t = advancePhase(t, escopos);
		expect(activePlayer(t)).toBe("q");
		expect(t.counters["turn:p:y"]).toBeUndefined();
		expect(t.counters["round:p:z"]).toBe(1);
		t = endTurn(t, escopos);
		expect(t.turn.round).toBe(2);
		expect(t.counters["round:p:z"]).toBeUndefined();
		expect(() => clearScope(t, escopos, "nada")).toThrow(/Escopo desconhecido/);
	});
});

describe("alvos, custos e escolhas", () => {
	it("valida seletores e confere alvos com filtro e predicado", () => {
		const e = mesa().engine;
		const base = { id: "s", zones: ["mesa"], controller: "any" as const, min: 1, max: 1 };
		expect(() => validateSelector({ ...base, id: "" })).toThrow(/id vazio/);
		expect(() => validateSelector({ ...base, zones: [] })).toThrow(/sem zonas/);
		expect(() => validateSelector({ ...base, min: -1 })).toThrow(/min inválido/);
		expect(() => validateSelector({ ...base, min: 2, max: 1 })).toThrow(/max menor/);
		expect(() => validateSelector({ ...base, zones: ["nada"] }, e)).toThrow(/zona desconhecida/);
		expect(legalTargets(e, { ...base, defIds: ["outra"] }, "p")).toEqual(["c"]);
		expect(legalTargets(e, base, "p", (inst) => inst.id === "b")).toEqual(["b"]);
		expect(legalTargets(e, { ...base, controller: "self" }, "q")).toEqual(["b"]);
		expect(checkTargets(e, { ...base, max: 2 }, "p", ["b", "b"])).toEqual({
			ok: false,
			reason: "alvo repetido",
		});
	});

	it("custos: requisito, pool insuficiente e valor inválido", () => {
		const e = mesa().engine;
		const exige = requirementCost<typeof e>("ter-mesa", (s) => s.zones.mesa.cards.length > 5, "mesa vazia");
		expect(exige.canPay(e, "p")).toEqual({ ok: false, reason: "mesa vazia" });
		expect(() => payCosts([exige], e, "p")).toThrow(/Custo não pago: mesa vazia/);
		const livre = requirementCost<typeof e>("sempre", () => true, "-");
		expect(livre.pay(e, "p")).toBe(e);
		expect(() => spendPool(e, "p", "ouro", 1)).toThrow(/insuficiente/);
		expect(() => resourceCost("ouro", -1)).toThrow(/Custo inválido/);
		expect(() => resourceCost("ouro", 1.5)).toThrow(/Custo inválido/);
	});

	it("escolhas: limites, jogador, resposta e retomada customizada", () => {
		const e = mesa().engine;
		expect(() => normalizeChoice({ ...e, players: [] }, { id: "c", options: ["x"] })).toThrow(/sem jogador/);
		expect(() => normalizeChoice(e, { id: "c", options: ["x"], player: "fantasma" })).toThrow(/desconhecido/);
		expect(() => normalizeChoice(e, { id: "c", options: ["x"], min: 2 })).toThrow(/limites inválidos/);
		expect(() => normalizeChoice(e, { id: "c", options: ["x", "x"] })).toThrow(/repetidas/);
		const aberta = openChoice(e, { id: "c", options: ["x", "y"], player: "q" }, []);
		expect(pendingChoiceOf(aberta)?.player).toBe("q");
		expect(() => openChoice(aberta, { id: "d", options: ["x"] }, [])).toThrow(/Já existe/);
		const escolha = pendingChoiceOf(aberta)!;
		expect(() => validateAnswer(escolha, { choice: "outra", player: "q", picks: ["x"] })).toThrow(/pendente é/);
		const dupla = normalizeChoice(e, { id: "d", options: ["x", "y"], max: 2 });
		expect(() => validateAnswer(dupla, { choice: "d", player: "p", picks: ["x", "x"] })).toThrow(/repetida/);
		const base: S = { ...mesa(), engine: aberta };
		expect(() =>
			answerPendingBy(mesa(), { choice: "c", player: "q", picks: ["x"] }, (s) => s),
		).toThrow(/Nenhuma escolha pendente/);
		expect(() =>
			answerPendingBy(base, { choice: "z", player: "q", picks: ["x"] }, (s) => s),
		).toThrow(/pendente é/);
		const feito = answerPendingBy(
			base,
			{ choice: "c", player: "q", picks: ["y"] },
			(s, _p, a) => withGame(s, (g) => ({ rodada: g.rodada + a.picks.length })),
			{ check: () => null },
		);
		expect(feito.game.rodada).toBe(1);
	});
});

describe("montagem, dados, janelas e projeção", () => {
	const conteudoBruto = {
		card: () => ({ id: "x" }),
		hasCard: () => true,
		cards: (): unknown[] => [{ id: "x" }],
		abilitiesOf: () => [],
		ability: () => ({}),
		hasAbility: () => true,
		text: (k: string) => k,
	};
	const bruto = (over: Record<string, unknown> = {}) =>
		({
			ruleset: { id: "r", version: "1", balance: {}, transitions: {}, eventRules: {} },
			content: conteudoBruto,
			kinds: createKindRegistry([]),
			dice: () => scriptedDice([]),
			requirements: { met: () => true },
			scopes: { registry: createScopeRegistry(), key: () => "" },
			...over,
		}) as never;

	it("createEngine valida a configuração e expõe o conteúdo indexado", () => {
		const motor = createEngine(bruto());
		expect(motor.content.card("x")).toEqual({ id: "x" });
		expect(motor.content.hasCard("x")).toBe(true);
		expect(motor.content.ability("a")).toEqual({});
		expect(motor.content.hasAbility("a")).toBe(true);
		expect(motor.content.text("k")).toBe("k");
		expect(motor.content.abilitiesOf("zzz")).toEqual([]);
		expect(() => motor.content.card("nada")).toThrow(/carta inexistente/);
		expect(() => createEngine(bruto({ ruleset: { id: "", version: "1" } }))).toThrow(/ruleset.id/);
		expect(() => createEngine(bruto({ ruleset: { id: "r", version: "" } }))).toThrow(/version/);
		expect(() => createEngine(bruto({ dice: 1 }))).toThrow(/dice deve/);
		expect(() => createEngine(bruto({ scopes: { registry: createScopeRegistry([]), key: () => "" } }))).toThrow(/scopes vazio/);
		expect(() => createEngine(bruto({ kinds: {} }))).toThrow(/registro de kinds/);
		const cartas = (...ids: unknown[]) => ({
			...conteudoBruto,
			cards: () => ids.map((i) => ({ id: i })),
		});
		expect(() => createEngine(bruto({ content: cartas(undefined) }))).toThrow(/carta sem id/);
		expect(() => createEngine(bruto({ content: cartas("x", "x") }))).toThrow(/duplicado/);
	});

	it("dados: faixa, ids, embaralhamento e semente", () => {
		expect(() => roll(scriptedDice([7]), 6)).toThrow(/fora da faixa/);
		expect(() => roll(scriptedDice([1]), 0)).toThrow(/Dado inválido/);
		expect(() => roll(scriptedDice([]), 6)).toThrow(/esgotados/);
		const identificador = id(seededDice(3), "obj");
		expect(identificador.value).toMatch(/^obj-/);
		expect(id(scriptedDice([1, 1]), "x").value).toBe("x-0-0");
		expect(float(seededDice(1)).next.counter).toBe(1);
		expect(int(seededDice(9), 10).value).toBeLessThan(10);
		expect(remainingScripted(seededDice(1))).toBe(0);
		const { items, next } = shuffleWith(seededDice(5), [1, 2, 3, 4, 5]);
		expect([...items].sort()).toEqual([1, 2, 3, 4, 5]);
		expect(next.kind).toBe("seeded");
		expect(shuffleWith(seededDice(5), [1, 2, 3, 4, 5]).items).toEqual(items);
	});

	it("janela e projeção: consulta de janela, contadores visíveis e zonas ocultas ao dono", () => {
		const s = mesa();
		expect(windowOf(s.engine)).toBeUndefined();
		expect(windowIsOpen(s.engine)).toBe(false);
		const oculta = createEngineState({
			dice: scriptedDice([]),
			players: ["p", "q"],
			cards: [{ id: "k", defId: "d", owner: "p" }],
			zones: [{ id: "cofre", owner: "p", visibility: "hidden", cards: ["k"] }],
			counters: [{ ...PTS, value: 1 }, { scope: "jogo", id: "-", name: "segredo", value: 9 }],
		});
		const dono = project(oculta, "p", { counterVisible: (key) => !key.endsWith("segredo") });
		const outro = project(oculta, "q");
		expect(dono.zones.cofre).toMatchObject({ count: 1, cards: null });
		expect(outro.zones.cofre).toMatchObject({ count: null, cards: null });
		expect(dono.counters).toEqual({ "jogo:-:pts": 1 });
		expect(outro.counters["jogo:-:segredo"]).toBe(9);
		const custom = project(oculta, "q", { zoneVisibility: () => "public" });
		expect(custom.zones.cofre.cards?.map((c) => c.id)).toEqual(["k"]);
	});
});

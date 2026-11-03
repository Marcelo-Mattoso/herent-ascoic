import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	cardsOf,
	controllerOf,
	counterOf,
	createPhaseFlow,
	eventsOfType,
	project,
	remainingScripted,
	resourceCost,
	spendPool,
	transitionsFromMap,
} from "../../../src/engine";
import {
	acoesLegais,
	agir,
	catalogo,
	type ConteudoDeck,
	COMPRAS,
	conteudoDeck,
	criarMotorDeck,
	type DeckAction,
	type DeckState,
	fluxoDeck,
	JOGADOR,
	META_PONTOS,
	MOEDAS,
	type MotorDeck,
	novaPartidaDeck,
	pontosDe,
	TRANSICOES,
} from "./game";

const cobres = (...n: number[]): DeckAction[] =>
	n.map((i) => ({ type: "JOGAR_TESOURO", carta: `cobre-${i}` }));

function rodar(
	motor: MotorDeck,
	inicial: DeckState,
	acoes: readonly DeckAction[],
): DeckState {
	return acoes.reduce((s, a) => agir(motor, s, a), inicial);
}

const COMECAR: DeckAction = { type: "COMECAR" };
const ACAO_FIM: DeckAction = { type: "ENCERRAR_ACAO" };
const TURNO_FIM: DeckAction = { type: "ENCERRAR_TURNO" };
const comprar = (carta: string): DeckAction => ({ type: "COMPRAR", carta });
const tesouro = (carta: string): DeckAction => ({
	type: "JOGAR_TESOURO",
	carta,
});

describe("deckbuilder solo", () => {
	it("é montado por createEngine, sem src/core nem src/data", () => {
		const fonte = readFileSync(new URL("./game.ts", import.meta.url), "utf8");
		expect(fonte).not.toMatch(/src\/core|src\/data|@\/core|@\/data/);
		expect(fonte).toContain("createEngine");
		expect(criarMotorDeck([]).ruleset.id).toBe("deckbuilder-solo");
	});

	it("a tabela de transições declara o fluxo da partida", () => {
		expect(TRANSICOES.map((t) => `${t.from}-${t.on}->${t.to}`)).toEqual([
			"preparo-COMECAR->acao",
			"acao-ENCERRAR_ACAO->compra",
			"compra-ENCERRAR_TURNO->acao",
			"compra-ENCERRAR_TURNO->fim",
		]);
		expect(fluxoDeck.targetsFrom("compra")).toEqual(["acao", "fim"]);
		expect(fluxoDeck.canTransition("acao", "fim")).toBe(false);
		expect(fluxoDeck.handlers.map((h) => h.id)).toEqual([
			"preparo",
			"acao",
			"compra",
		]);
	});

	it("vitória em 3 turnos: mercado, compra com moedas e reembaralhar o descarte", () => {
		// Embaralhar [ducado,c1..c5,tapete-r5,t8,t9,t10,c6,c7] com onze rolagens 1
		// (troca cada posição i com a 0, de trás para frente) dá
		// [c1..c5,tapete-r5,t8,t9,t10,c6,c7,ducado]: o turno 3 abre com cinco cobres.
		const motor = criarMotorDeck([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
		let s = novaPartidaDeck(motor);
		expect(s.game.fase).toBe("preparo");
		expect(cardsOf(s.engine, "reserva")).toHaveLength(15);

		s = agir(motor, s, COMECAR);
		expect(s.game.fase).toBe("acao");
		expect(cardsOf(s.engine, "mercado")).toEqual([
			"prata-r1",
			"ferreiro-r2",
			"ducado-r3",
			"feira-r4",
			"tapete-r5",
		]);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"cobre-1",
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"cobre-5",
		]);
		expect(pontosDe(s)).toBe(3);

		s = rodar(motor, s, [ACAO_FIM, ...cobres(1, 2, 3, 4, 5)]);
		expect(s.game.fase).toBe("compra");
		expect(counterOf(s.engine, MOEDAS)).toBe(5);
		s = agir(motor, s, comprar("ducado-r3"));
		expect(counterOf(s.engine, MOEDAS)).toBe(0);
		expect(counterOf(s.engine, COMPRAS)).toBe(0);
		expect(cardsOf(s.engine, "mercado")).toEqual([
			"prata-r1",
			"ferreiro-r2",
			"feira-r4",
			"tapete-r5",
			"ducado-r6",
		]);
		expect(pontosDe(s)).toBe(6);
		s = agir(motor, s, TURNO_FIM);

		expect(s.game.fase).toBe("acao");
		expect(s.engine.turn.turn).toBe(2);
		expect(counterOf(s.engine, MOEDAS)).toBe(0);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"cobre-6",
			"cobre-7",
			"tapete-8",
			"tapete-9",
			"tapete-10",
		]);
		expect(cardsOf(s.engine, "descarte")).toEqual(
			cardsOf(s.engine, "descarte").slice(0, 6),
		);

		s = rodar(motor, s, [ACAO_FIM, ...cobres(6, 7), comprar("tapete-r5")]);
		expect(pontosDe(s)).toBe(7);
		s = agir(motor, s, TURNO_FIM);

		expect(s.engine.turn.turn).toBe(3);
		expect(remainingScripted(s.engine.dice)).toBe(0);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"cobre-1",
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"cobre-5",
		]);
		expect(cardsOf(s.engine, "baralho")).toEqual([
			"tapete-r5",
			"tapete-8",
			"tapete-9",
			"tapete-10",
			"cobre-6",
			"cobre-7",
			"ducado-r3",
		]);
		expect(cardsOf(s.engine, "descarte")).toEqual([]);

		s = rodar(motor, s, [ACAO_FIM, ...cobres(1, 2, 3, 4, 5)]);
		s = agir(motor, s, comprar("ducado-r6"));
		expect(pontosDe(s)).toBe(META_PONTOS);
		expect(s.game.fase).toBe("compra");
		s = agir(motor, s, TURNO_FIM);

		expect(s.game).toEqual({ fase: "fim", resultado: "vitoria" });
		expect(eventsOfType(s.engine.events, "partida_encerrada")).toEqual([
			expect.objectContaining({
				payload: { resultado: "vitoria", pontos: 10, turno: 3 },
			}),
		]);
		expect(
			eventsOfType(s.engine.events, "carta_comprada").map((e) => e.payload),
		).toEqual([
			{ carta: "ducado-r3", definicao: "ducado", custo: 5 },
			{ carta: "tapete-r5", definicao: "tapete", custo: 2 },
			{ carta: "ducado-r6", definicao: "ducado", custo: 5 },
		]);
		expect(eventsOfType(s.engine.events, "zona.embaralhada")).toHaveLength(1);
		expect(acoesLegais(motor, s)).toEqual([]);
		expect(() => agir(motor, s, ACAO_FIM)).toThrow(/Nenhum handler/);
	});

	it("derrota pelo limite de turnos, com ações Feira e dois reembaralhamentos", () => {
		// 1º embaralhar [feira,c1..c5,t8,t9,t10,c6,c7], rolagens 2: [feira,c2..c5,t8,t9,t10,c6,c7,c1]
		// 2º embaralhar o descarte do turno 4 (13 cartas), rolagens 1:
		// [t8,feira,c2..c5,prata,t9,t10,c6,c7,c1,ducado]
		const dados = [...Array(10).fill(2), ...Array(12).fill(1)];
		const motor = criarMotorDeck(dados);
		let s = agir(motor, novaPartidaDeck(motor), COMECAR);

		s = rodar(motor, s, [
			ACAO_FIM,
			...cobres(1, 2, 3, 4, 5),
			comprar("feira-r4"),
			TURNO_FIM,
			ACAO_FIM,
			...cobres(6, 7),
			TURNO_FIM,
		]);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"feira-r4",
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"cobre-5",
		]);

		s = agir(motor, s, { type: "JOGAR_ACAO", carta: "feira-r4" });
		expect(cardsOf(s.engine, "mao")).toEqual([
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"cobre-5",
			"tapete-8",
		]);
		expect(counterOf(s.engine, MOEDAS)).toBe(2);
		expect(() =>
			agir(motor, s, { type: "JOGAR_ACAO", carta: "cobre-2" }),
		).toThrow(/não é do tipo acao/);
		s = rodar(motor, s, [
			ACAO_FIM,
			...cobres(2, 3, 4, 5),
			comprar("ducado-r3"),
			TURNO_FIM,
		]);
		expect(s.engine.turn.turn).toBe(4);
		expect(pontosDe(s)).toBe(6);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"tapete-9",
			"tapete-10",
			"cobre-6",
			"cobre-7",
			"cobre-1",
		]);

		s = rodar(motor, s, [
			ACAO_FIM,
			...cobres(6, 7, 1),
			comprar("prata-r1"),
			TURNO_FIM,
		]);
		expect(s.engine.turn.turn).toBe(5);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"tapete-8",
			"feira-r4",
			"cobre-2",
			"cobre-3",
			"cobre-4",
		]);
		expect(remainingScripted(s.engine.dice)).toBe(0);

		s = rodar(motor, s, [
			{ type: "JOGAR_ACAO", carta: "feira-r4" },
			ACAO_FIM,
			...cobres(2, 3, 4),
		]);
		expect(counterOf(s.engine, MOEDAS)).toBe(5);
		s = rodar(motor, s, [comprar("tapete-r5"), TURNO_FIM]);
		expect(pontosDe(s)).toBe(7);
		expect(s.engine.turn.turn).toBe(6);
		expect(s.game.fase).toBe("acao");

		s = rodar(motor, s, [ACAO_FIM, TURNO_FIM]);
		expect(s.game).toEqual({ fase: "fim", resultado: "derrota" });
		expect(eventsOfType(s.engine.events, "partida_encerrada")[0]?.payload).toEqual({
			resultado: "derrota",
			pontos: 7,
			turno: 6,
		});
		expect(eventsOfType(s.engine.events, "zona.embaralhada")).toHaveLength(2);
	});

	it("a compra recusa saldo insuficiente, segunda compra e carta fora do mercado", () => {
		const motor = criarMotorDeck([]);
		let s = rodar(motor, novaPartidaDeck(motor), [
			COMECAR,
			ACAO_FIM,
			...cobres(1, 2, 3),
		]);
		expect(() => agir(motor, s, comprar("ducado-r3"))).toThrow(
			/moedas insuficiente/,
		);
		expect(() => agir(motor, s, comprar("ouro-r7"))).toThrow(
			/não está no mercado/,
		);
		s = agir(motor, s, comprar("prata-r1"));
		expect(() => agir(motor, s, comprar("tapete-r5"))).toThrow(
			/moedas insuficiente|compras insuficiente/,
		);
		s = rodar(motor, s, [tesouro("cobre-4")]);
		expect(() => agir(motor, s, comprar("tapete-r5"))).toThrow(
			/compras insuficiente/,
		);
	});

	it("fase errada, carta fora da mão e transição inválida são recusadas", () => {
		const motor = criarMotorDeck([]);
		const inicio = novaPartidaDeck(motor);
		expect(() => agir(motor, inicio, ACAO_FIM)).toThrow(/Nenhum handler/);
		const s = agir(motor, inicio, COMECAR);
		expect(() => agir(motor, s, tesouro("cobre-1"))).toThrow(/Nenhum handler/);
		expect(() => agir(motor, s, COMECAR)).toThrow(/Nenhum handler/);
		const compra = agir(motor, s, ACAO_FIM);
		expect(() => agir(motor, compra, tesouro("cobre-9"))).toThrow(
			/não está na mão/,
		);
		expect(() => agir(motor, compra, tesouro("tapete-8"))).toThrow(
			/não está na mão|não é do tipo/,
		);
		const negado = fluxoDeck.dispatch(inicio, ACAO_FIM, motor);
		expect(negado.rejection?.code).toBe("unhandled");
		expect(negado.state).toBe(inicio);
	});

	it("Banqueiro e Tesoureiro: if_counter, repeat e moedas_por_zona", () => {
		const montagem = {
			baralho: [
				"banqueiro",
				"cobre",
				"cobre",
				"cobre",
				"tesoureiro",
				"ferreiro",
				...Array<string>(6).fill("cobre"),
			],
			descarte: Array<string>(7).fill("tapete"),
		};
		const motor = criarMotorDeck([]);
		const abrir = () =>
			rodar(motor, novaPartidaDeck(motor, montagem), [COMECAR, ACAO_FIM]);

		const sozinho = agir(motor, abrir(), tesouro("banqueiro-1"));
		expect(counterOf(sozinho.engine, MOEDAS)).toBe(1);

		const cheio = rodar(motor, abrir(), [
			...cobres(2, 3, 4),
			tesouro("tesoureiro-5"),
		]);
		expect(counterOf(cheio.engine, MOEDAS)).toBe(5);
		const banco = agir(motor, cheio, tesouro("banqueiro-1"));
		expect(counterOf(banco.engine, MOEDAS)).toBe(9);
		expect(cardsOf(banco.engine, "jogadas")).toEqual([
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"tesoureiro-5",
			"banqueiro-1",
		]);
	});

	it("Ferreiro compra 3 e reembaralha o descarte quando o baralho acaba", () => {
		// descarte [d1..d4] com rolagens 1,1,1 (troca i com 0, i=3..1) = [d2,d3,d4,d1]
		const motor = criarMotorDeck([1, 1, 1]);
		const s = rodar(
			motor,
			novaPartidaDeck(motor, {
				baralho: ["ferreiro", ...Array<string>(6).fill("cobre")],
				descarte: Array<string>(4).fill("tapete"),
			}),
			[COMECAR, { type: "JOGAR_ACAO", carta: "ferreiro-1" }],
		);
		expect(cardsOf(s.engine, "mao")).toEqual([
			"cobre-2",
			"cobre-3",
			"cobre-4",
			"cobre-5",
			"cobre-6",
			"cobre-7",
			"tapete-d2",
		]);
		expect(cardsOf(s.engine, "baralho")).toEqual([
			"tapete-d3",
			"tapete-d4",
			"tapete-d1",
		]);
		expect(cardsOf(s.engine, "descarte")).toEqual([]);
		expect(remainingScripted(s.engine.dice)).toBe(0);
		expect(counterOf(s.engine, { scope: "turn", id: "p", name: "acoes" })).toBe(0);
	});

	it("um handler que pula a tabela é recusado (reject) ou reportado (apply-and-report)", () => {
		const motor = criarMotorDeck([]);
		const s = agir(motor, novaPartidaDeck(motor), COMECAR);
		const pula = {
			id: "pula",
			phases: ["acao" as const],
			actions: ["ENCERRAR_ACAO" as const],
			legalActions: () => [],
			apply: (state: DeckState) => ({
				...state,
				game: { fase: "fim" as const },
			}),
		};
		const reject = createPhaseFlow<DeckState, DeckAction, undefined>({
			phaseOf: (state) => state.game.fase,
			handlers: [pula],
			transitions: TRANSICOES,
		});
		const recusado = reject.dispatch(s, ACAO_FIM, undefined);
		expect(recusado.state).toBe(s);
		expect(recusado.rejection).toMatchObject({
			code: "invalid_transition",
			applied: false,
			from: "acao",
			to: "fim",
		});
		const relata = createPhaseFlow<DeckState, DeckAction, undefined>({
			phaseOf: (state) => state.game.fase,
			handlers: [pula],
			transitions: TRANSICOES,
			onInvalidTransition: "apply-and-report",
		});
		const aplicado = relata.dispatch(s, ACAO_FIM, undefined);
		expect(aplicado.state.game.fase).toBe("fim");
		expect(aplicado.rejection?.applied).toBe(true);
		expect(aplicado.change).toEqual({ from: "acao", to: "fim" });
		expect(() =>
			createPhaseFlow<DeckState, DeckAction, undefined>({
				phaseOf: (state) => state.game.fase,
				handlers: [pula, pula],
				transitions: [],
			}),
		).toThrow(/duplicado/);
	});

	it("Fornalha remove cartas do jogo, Mina cria cobres e Vidente inverte o topo", () => {
		const motor = criarMotorDeck([]);
		const abrir = (baralho: string[]) =>
			agir(motor, novaPartidaDeck(motor, { baralho }), COMECAR);
		const base = ["cobre", "tapete", "cobre", "cobre", "cobre", "ouro", "prata", "ducado"];

		let s = abrir(["fornalha", ...base]);
		const total = Object.keys(s.engine.cards).length;
		s = agir(motor, s, { type: "JOGAR_ACAO", carta: "fornalha-1" });
		expect(cardsOf(s.engine, "mao")).toEqual(["cobre-4", "cobre-5"]);
		expect(Object.keys(s.engine.cards)).toHaveLength(total - 2);
		expect(s.engine.cards["cobre-2"]).toBeUndefined();
		expect(s.engine.cards["tapete-3"]).toBeUndefined();

		s = abrir(["mina", ...base]);
		s = agir(motor, s, { type: "JOGAR_ACAO", carta: "mina-1" });
		expect(cardsOf(s.engine, "mao")).toHaveLength(6);
		const nova = cardsOf(s.engine, "mao").slice(-2);
		expect(nova.every((id) => s.engine.cards[id]?.defId === "cobre")).toBe(true);
		expect(new Set(nova).size).toBe(2);
		expect(Object.keys(s.engine.cards)).toHaveLength(total + 2);

		s = abrir(["vidente", ...base]);
		expect(cardsOf(s.engine, "baralho")).toEqual([
			"cobre-6",
			"ouro-7",
			"prata-8",
			"ducado-9",
		]);
		s = agir(motor, s, { type: "JOGAR_ACAO", carta: "vidente-1" });
		expect(cardsOf(s.engine, "baralho")).toEqual([
			"prata-8",
			"ouro-7",
			"cobre-6",
			"ducado-9",
		]);
	});

	it("o grafo de fases também pode ser declarado como mapa {de: [para]}", () => {
		const mapa = transitionsFromMap<DeckState, DeckAction>({
			preparo: ["acao"],
			acao: ["compra"],
			compra: ["acao", "fim"],
		});
		const fluxo = createPhaseFlow<DeckState, DeckAction, undefined>({
			phaseOf: (state) => state.game.fase,
			handlers: [],
			transitions: mapa,
		});
		for (const fase of ["preparo", "acao", "compra"]) {
			expect(fluxo.targetsFrom(fase)).toEqual(fluxoDeck.targetsFrom(fase));
		}
		expect(fluxo.canTransition("preparo", "fim")).toBe(false);
		expect(() =>
			createPhaseFlow<DeckState, DeckAction, undefined>({
				phaseOf: (state) => state.game.fase,
				handlers: [
					{
						id: "mudo",
						phases: ["acao"],
						actions: [],
						legalActions: () => [],
						apply: (state) => state,
					},
				],
				transitions: mapa,
			}),
		).toThrow(/sem actions/);
	});

	it("o mercado é público e sem dono; baralho e reserva mostram só a contagem", () => {
		const motor = criarMotorDeck([]);
		const s = agir(motor, novaPartidaDeck(motor), COMECAR);
		expect(controllerOf(s.engine, "prata-r1")).toBeUndefined();
		expect(controllerOf(s.engine, "cobre-1")).toBe(JOGADOR);
		const visao = project(s.engine, JOGADOR);
		expect(visao.zones.mercado.cards?.map((c) => c.id)).toEqual(
			cardsOf(s.engine, "mercado"),
		);
		expect(visao.zones.mao.cards).toHaveLength(5);
		expect(visao.zones.baralho).toMatchObject({ cards: null, count: 5 });
		expect(visao.zones.reserva).toMatchObject({ cards: null, count: 10 });
		expect(visao.cards["cobre-6"]).toBeUndefined();
	});

	it("custos de recurso recusam valores inválidos e saldo insuficiente", () => {
		const motor = criarMotorDeck([]);
		const s = agir(motor, novaPartidaDeck(motor), COMECAR);
		expect(() => resourceCost("moedas", -1)).toThrow(/Custo inválido/);
		expect(() => spendPool(s.engine, JOGADOR, "moedas", 1)).toThrow(
			/insuficiente/,
		);
	});

	it("jogo aleatório com dados semeados: ações legais sempre aplicam e as cartas se conservam", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const motor = criarMotorDeck(seed);
			let s = novaPartidaDeck(motor);
			let rng = seed * 2654435761;
			const proximo = (n: number) => {
				rng = (Math.imul(rng, 1103515245) + 12345) >>> 0;
				return rng % n;
			};
			let passos = 0;
			while (s.game.fase !== "fim") {
				const legais = acoesLegais(motor, s);
				expect(legais.length).toBeGreaterThan(0);
				for (const legal of legais) agir(motor, s, legal);
				s = agir(motor, s, legais[proximo(legais.length)]);
				const emZonas = Object.values(s.engine.zones).flatMap((z) => z.cards);
				expect(new Set(emZonas).size).toBe(emZonas.length);
				expect(emZonas.length).toBe(Object.keys(s.engine.cards).length);
				expect(
					Object.values(s.engine.counters).every((v) => v >= 0),
				).toBe(true);
				expect(++passos).toBeLessThan(400);
			}
			expect(s.game.resultado).toBeDefined();
			expect(
				(s.game.resultado === "vitoria") === (pontosDe(s) >= META_PONTOS),
			).toBe(true);
		}
	});

	it("conteúdo com kind não registrado é recusado por createEngine", () => {
		const ruim: ConteudoDeck = {
			...conteudoDeck,
			cards: () => [
				...catalogo,
				{
					id: "maldita",
					nome: "Maldita",
					tipo: "acao" as const,
					custo: 1,
					pontos: 0,
					efeitos: [{ kind: "inexistente" }],
				},
			],
			abilitiesOf: (id: string) =>
				id === "maldita"
					? [{ def: { id: "maldita.efeitos", efeitos: [{ kind: "inexistente" }] }, ref: null }]
					: conteudoDeck.abilitiesOf(id),
		};
		expect(() => criarMotorDeck([], ruim)).toThrow(
			/sem implementação registrada/,
		);

	});
});

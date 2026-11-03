import { z } from "zod";
import {
	addToCounter,
	advancePhase,
	appendEvent,
	type CardInstance,
	type Cost,
	type ContentPort,
	type CounterRef,
	cardsOf,
	checkCosts,
	configureTurns,
	counterOf,
	createEngine,
	createEngineState,
	createKindRegistryFrom,
	createPhaseFlow,
	createScopeRegistry,
	defineKind,
	drawCards,
	type Engine,
	type EngineEventMap,
	engineBuiltinKinds,
	type GameState,
	instanceOf,
	type KindNode,
	type KindPackage,
	type KindRegistry,
	moveCard,
	removeCard,
	reorderZone,
	zoneHolding,
	addCard,
	type PhaseFlow,
	type PhaseHandler,
	type Transition,
	nextSeq,
	PAYABLE,
	payCosts,
	scriptedDice,
	seededDice,
	startTurns,
	withEngine,
	withGame,
} from "../../../src/engine";

export type TipoCarta = "tesouro" | "acao" | "pontos";

export interface CartaDeck {
	readonly id: string;
	readonly nome: string;
	readonly tipo: TipoCarta;
	readonly custo: number;
	readonly pontos: number;
	readonly efeitos: readonly KindNode[];
}

export interface HabilidadeDeck {
	readonly id: string;
	readonly efeitos: readonly KindNode[];
}

export type Fase = "preparo" | "acao" | "compra" | "fim";
export type Resultado = "vitoria" | "derrota";

export interface DeckGame {
	readonly fase: Fase;
	readonly resultado?: Resultado;
}

export type DeckEventMap = EngineEventMap & {
	carta_jogada: { carta: string; definicao: string };
	carta_comprada: { carta: string; definicao: string; custo: number };
	partida_encerrada: { resultado: Resultado; pontos: number; turno: number };
};

export type DeckState = GameState<DeckGame, DeckEventMap>;

export interface DeckCtx {
	readonly cause?: number;
}

export type DeckAction =
	| { readonly type: "COMECAR" }
	| { readonly type: "JOGAR_ACAO"; readonly carta: string }
	| { readonly type: "ENCERRAR_ACAO" }
	| { readonly type: "JOGAR_TESOURO"; readonly carta: string }
	| { readonly type: "COMPRAR"; readonly carta: string }
	| { readonly type: "ENCERRAR_TURNO" };

type KindsDeck = KindRegistry<DeckState, DeckCtx>;
export type ConteudoDeck = ContentPort<CartaDeck, HabilidadeDeck>;
type Vazio = Record<string, never>;

export type AmbienteDeck = Pick<
	Engine<DeckState, CartaDeck, HabilidadeDeck, Vazio, Vazio, ConteudoDeck, KindsDeck>,
	"kinds" | "content"
>;

export type FluxoDeck = PhaseFlow<DeckState, DeckAction, AmbienteDeck>;

export type MotorDeck = Engine<
	DeckState,
	CartaDeck,
	HabilidadeDeck,
	Vazio,
	Vazio,
	ConteudoDeck,
	KindsDeck,
	FluxoDeck
>;

export const JOGADOR = "p";
export const TAMANHO_MAO = 5;
export const MERCADO_TAMANHO = 5;
export const META_PONTOS = 10;
export const LIMITE_TURNOS = 6;

export const MOEDAS: CounterRef = { scope: "turn", id: JOGADOR, name: "moedas" };
export const ACOES: CounterRef = { scope: "turn", id: JOGADOR, name: "acoes" };
export const COMPRAS: CounterRef = { scope: "turn", id: JOGADOR, name: "compras" };

const ZONAS_DO_JOGADOR = ["baralho", "mao", "jogadas", "descarte"] as const;

export const catalogo: readonly CartaDeck[] = [
	{ id: "cobre", nome: "Cobre", tipo: "tesouro", custo: 0, pontos: 0, efeitos: [{ kind: "moedas", valor: 1 }] },
	{ id: "prata", nome: "Prata", tipo: "tesouro", custo: 3, pontos: 0, efeitos: [{ kind: "moedas", valor: 2 }] },
	{ id: "ouro", nome: "Ouro", tipo: "tesouro", custo: 6, pontos: 0, efeitos: [{ kind: "moedas", valor: 3 }] },
	{ id: "ferreiro", nome: "Ferreiro", tipo: "acao", custo: 4, pontos: 0, efeitos: [{ kind: "comprar_cartas", quantidade: 3 }] },
	{
		id: "feira",
		nome: "Feira",
		tipo: "acao",
		custo: 3,
		pontos: 0,
		efeitos: [
			{ kind: "comprar_cartas", quantidade: 1 },
			{ kind: "change_counter", counter: MOEDAS, delta: 2 },
		],
	},
	{
		id: "tesoureiro",
		nome: "Tesoureiro",
		tipo: "tesouro",
		custo: 4,
		pontos: 0,
		efeitos: [{ kind: "moedas_por_zona", zona: "descarte", divisor: 3 }],
	},
	{
		id: "fornalha",
		nome: "Fornalha",
		tipo: "acao",
		custo: 4,
		pontos: 0,
		efeitos: [{ kind: "queimar", quantidade: 2 }],
	},
	{
		id: "mina",
		nome: "Mina",
		tipo: "acao",
		custo: 5,
		pontos: 0,
		efeitos: [{ kind: "criar_na_mao", definicao: "cobre", quantidade: 2 }],
	},
	{
		id: "vidente",
		nome: "Vidente",
		tipo: "acao",
		custo: 3,
		pontos: 0,
		efeitos: [{ kind: "reordenar_topo", quantidade: 3 }],
	},
	{
		id: "banqueiro",
		nome: "Banqueiro",
		tipo: "tesouro",
		custo: 5,
		pontos: 0,
		efeitos: [
			{
				kind: "if_counter",
				counter: MOEDAS,
				op: "gte",
				value: 3,
				then: [{ kind: "repeat", times: 2, do: [{ kind: "moedas", valor: 2 }] }],
				else: [{ kind: "moedas", valor: 1 }],
			},
		],
	},
	{ id: "tapete", nome: "Tapete", tipo: "pontos", custo: 2, pontos: 1, efeitos: [] },
	{ id: "ducado", nome: "Ducado", tipo: "pontos", custo: 5, pontos: 3, efeitos: [] },
	{ id: "reino", nome: "Reino", tipo: "pontos", custo: 8, pontos: 6, efeitos: [] },
];

export const conteudoDeck: ConteudoDeck = {
	card(id) {
		const carta = catalogo.find((c) => c.id === id);
		if (!carta) throw new Error(`Carta fora do catálogo: ${id}`);
		return carta;
	},
	hasCard: (id) => catalogo.some((c) => c.id === id),
	cards: () => catalogo,
	abilitiesOf: (id) => [
		{
			def: { id: `${id}.efeitos`, efeitos: conteudoDeck.card(id).efeitos },
			ref: null,
		},
	],
	ability(id) {
		const carta = catalogo.find((c) => `${c.id}.efeitos` === id);
		if (!carta) throw new Error(`Habilidade inexistente: ${id}`);
		return { id, efeitos: carta.efeitos };
	},
	hasAbility: (id) => catalogo.some((c) => `${c.id}.efeitos` === id),
	text: (key) => key,
};

const moedas = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"moedas">; valor: z.ZodNumber }>
>({
	kind: "moedas",
	category: "effect",
	schema: z.object({
		kind: z.literal("moedas"),
		valor: z.number().int().min(1),
	}),
	resolve: (state, node, ctx) => ({
		state: withEngine(state, (e) =>
			addToCounter(e, MOEDAS, node.valor, { cause: ctx.cause }),
		),
	}),
});

const comprarCartas = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"comprar_cartas">; quantidade: z.ZodNumber }>
>({
	kind: "comprar_cartas",
	category: "effect",
	schema: z.object({
		kind: z.literal("comprar_cartas"),
		quantidade: z.number().int().min(1),
	}),
	resolve: (state, node) => ({
		state: withEngine(state, (e) =>
			drawCards(e, "baralho", "mao", node.quantidade, {
				onEmpty: "reshuffle-from",
				source: "descarte",
			}),
		),
	}),
});

const moedasPorZona = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{
		kind: z.ZodLiteral<"moedas_por_zona">;
		zona: z.ZodString;
		divisor: z.ZodNumber;
	}>
>({
	kind: "moedas_por_zona",
	category: "effect",
	schema: z.object({
		kind: z.literal("moedas_por_zona"),
		zona: z.string(),
		divisor: z.number().int().min(1),
	}),
	resolve: (state, node, ctx) => {
		const ganho = Math.floor(cardsOf(state.engine, node.zona).length / node.divisor);
		return {
			state:
				ganho === 0
					? state
					: withEngine(state, (e) =>
							addToCounter(e, MOEDAS, ganho, { cause: ctx.cause }),
						),
		};
	},
});

const queimar = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"queimar">; quantidade: z.ZodNumber }>
>({
	kind: "queimar",
	category: "effect",
	schema: z.object({
		kind: z.literal("queimar"),
		quantidade: z.number().int().min(1),
	}),
	resolve: (state, node) => ({
		state: withEngine(state, (e) =>
			cardsOf(e, "mao")
				.slice(0, node.quantidade)
				.reduce(
					(atual, carta) =>
						zoneHolding(atual, carta) === "mao" ? removeCard(atual, carta) : atual,
					e,
				),
		),
	}),
});

const criarNaMao = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{
		kind: z.ZodLiteral<"criar_na_mao">;
		definicao: z.ZodString;
		quantidade: z.ZodNumber;
	}>
>({
	kind: "criar_na_mao",
	category: "effect",
	schema: z.object({
		kind: z.literal("criar_na_mao"),
		definicao: z.string(),
		quantidade: z.number().int().min(1),
	}),
	resolve: (state, node) => ({
		state: withEngine(state, (e) => {
			const base = nextSeq(e.events);
			let atual = e;
			for (let i = 0; i < node.quantidade; i++) {
				atual = addCard(
					atual,
					{ id: `${node.definicao}-n${base}${i}`, defId: node.definicao, owner: JOGADOR },
					"mao",
				);
			}
			return atual;
		}),
	}),
});

const reordenarTopo = defineKind<
	DeckState,
	DeckCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"reordenar_topo">; quantidade: z.ZodNumber }>
>({
	kind: "reordenar_topo",
	category: "effect",
	schema: z.object({
		kind: z.literal("reordenar_topo"),
		quantidade: z.number().int().min(2),
	}),
	resolve: (state, node) => ({
		state: withEngine(state, (e) => {
			const baralho = cardsOf(e, "baralho");
			const topo = baralho.slice(0, node.quantidade).reverse();
			return reorderZone(e, "baralho", [...topo, ...baralho.slice(node.quantidade)]);
		}),
	}),
});

export const pacoteDeck: KindPackage<DeckState, DeckCtx> = {
	id: "deckbuilder",
	kinds: [moedas, comprarCartas, moedasPorZona, queimar, criarNaMao, reordenarTopo],
};

function custoContador(ref: CounterRef, quantia: number, rotulo: string): Cost<DeckState> {
	return {
		id: `contador:${rotulo}`,
		canPay: (state) =>
			counterOf(state.engine, ref) >= quantia
				? PAYABLE
				: { ok: false, reason: `${rotulo} insuficiente (${quantia})` },
		pay: (state) => withEngine(state, (e) => addToCounter(e, ref, -quantia)),
	};
}

export function pontosDe(state: DeckState): number {
	let total = 0;
	for (const zona of ZONAS_DO_JOGADOR) {
		for (const carta of cardsOf(state.engine, zona)) {
			total += conteudoDeck.card(instanceOf(state.engine, carta).defId).pontos;
		}
	}
	return total;
}

export function terminou(state: DeckState): boolean {
	return (
		pontosDe(state) >= META_PONTOS || state.engine.turn.turn >= LIMITE_TURNOS
	);
}

function definicaoDe(state: DeckState, carta: string): CartaDeck {
	return conteudoDeck.card(instanceOf(state.engine, carta).defId);
}

function exigirNaMao(state: DeckState, carta: string, tipo: TipoCarta): CartaDeck {
	if (!cardsOf(state.engine, "mao").includes(carta)) {
		throw new Error(`Carta ${carta} não está na mão`);
	}
	const def = definicaoDe(state, carta);
	if (def.tipo !== tipo) {
		throw new Error(`Carta ${carta} não é do tipo ${tipo}`);
	}
	return def;
}

function jogar(
	state: DeckState,
	carta: string,
	def: CartaDeck,
	ambiente: AmbienteDeck,
): DeckState {
	const cause = nextSeq(state.engine.events);
	const movida = withEngine(state, (e) => {
		const movido = moveCard(e, carta, "mao", "jogadas", { cause });
		return {
			...movido,
			events: appendEvent(
				movido.events,
				"carta_jogada",
				{ carta, definicao: def.id },
				{ cause },
			),
		};
	});
	return ambiente.kinds.runAll(movida, def.efeitos, { cause }).state;
}

function entradaDe(state: DeckState, fase: Fase): DeckState {
	return withGame(state, (g) => ({ ...g, fase }));
}

function encerrar(state: DeckState): DeckState {
	const resultado: Resultado =
		pontosDe(state) >= META_PONTOS ? "vitoria" : "derrota";
	const final = withEngine(state, (e) => ({
		...e,
		events: appendEvent(e.events, "partida_encerrada", {
			resultado,
			pontos: pontosDe(state),
			turno: e.turn.turn,
		}),
	}));
	return withGame(final, () => ({ fase: "fim", resultado }));
}

const preparo: PhaseHandler<DeckState, DeckAction, AmbienteDeck> = {
	id: "preparo",
	phases: ["preparo"],
	accepts: (state) => state.game.fase === "preparo",
	actions: ["COMECAR"],
	legalActions: () => [{ type: "COMECAR" }],
	apply: (state, _action, _ambiente) => {
		let engine = drawCards(state.engine, "reserva", "mercado", MERCADO_TAMANHO);
		engine = drawCards(engine, "baralho", "mao", TAMANHO_MAO);
		engine = configureTurns(engine, {
			order: [JOGADOR],
			phases: ["acao", "compra"],
		});
		engine = startTurns(engine);
		return entradaDe({ ...state, engine }, "acao");
	},
};

const acao: PhaseHandler<DeckState, DeckAction, AmbienteDeck> = {
	id: "acao",
	phases: ["acao"],
	accepts: (state) => state.game.fase === "acao",
	actions: ["JOGAR_ACAO", "ENCERRAR_ACAO"],
	onEnter: (state) => withEngine(state, (e) => addToCounter(e, ACOES, 1)),
	legalActions: (state) => {
		const podeAgir = counterOf(state.engine, ACOES) >= 1;
		const jogadas: DeckAction[] = podeAgir
			? cardsOf(state.engine, "mao")
					.filter((c) => definicaoDe(state, c).tipo === "acao")
					.map((carta) => ({ type: "JOGAR_ACAO", carta }))
			: [];
		return [...jogadas, { type: "ENCERRAR_ACAO" }];
	},
	apply: (state, action, ambiente) => {
		if (action.type === "ENCERRAR_ACAO") {
			return entradaDe(
				withEngine(state, (e) => advancePhase(e, ESCOPOS)),
				"compra",
			);
		}
		if (action.type !== "JOGAR_ACAO") throw new Error(action.type);
		const def = exigirNaMao(state, action.carta, "acao");
		const custos = [custoContador(ACOES, 1, "ações")];
		const pago = payCosts(custos, state, JOGADOR);
		return jogar(pago, action.carta, def, ambiente);
	},
};

const compra: PhaseHandler<DeckState, DeckAction, AmbienteDeck> = {
	id: "compra",
	phases: ["compra"],
	accepts: (state) => state.game.fase === "compra",
	actions: ["JOGAR_TESOURO", "COMPRAR", "ENCERRAR_TURNO"],
	onEnter: (state) => withEngine(state, (e) => addToCounter(e, COMPRAS, 1)),
	legalActions: (state) => {
		const tesouros: DeckAction[] = cardsOf(state.engine, "mao")
			.filter((c) => definicaoDe(state, c).tipo === "tesouro")
			.map((carta) => ({ type: "JOGAR_TESOURO", carta }));
		const compras: DeckAction[] = cardsOf(state.engine, "mercado")
			.filter((carta) => custosDaCompra(state, carta).ok)
			.map((carta) => ({ type: "COMPRAR", carta }));
		return [...tesouros, ...compras, { type: "ENCERRAR_TURNO" }];
	},
	apply: (state, action, ambiente) => {
		switch (action.type) {
			case "JOGAR_TESOURO":
				return jogar(
					state,
					action.carta,
					exigirNaMao(state, action.carta, "tesouro"),
					ambiente,
				);
			case "COMPRAR":
				return comprarDoMercado(state, action.carta);
			case "ENCERRAR_TURNO":
				return fimDeTurno(state);
			default:
				throw new Error(action.type);
		}
	},
};

function custosDaCompra(state: DeckState, carta: string) {
	return checkCosts(
		[
			custoContador(COMPRAS, 1, "compras"),
			custoContador(MOEDAS, definicaoDe(state, carta).custo, "moedas"),
		],
		state,
		JOGADOR,
	);
}

function comprarDoMercado(state: DeckState, carta: string): DeckState {
	if (!cardsOf(state.engine, "mercado").includes(carta)) {
		throw new Error(`Carta ${carta} não está no mercado`);
	}
	const def = definicaoDe(state, carta);
	const pago = payCosts(
		[
			custoContador(COMPRAS, 1, "compras"),
			custoContador(MOEDAS, def.custo, "moedas"),
		],
		state,
		JOGADOR,
	);
	const cause = nextSeq(pago.engine.events);
	return withEngine(pago, (e) => {
		const movida = moveCard(e, carta, "mercado", "descarte", { cause });
		const reposta = drawCards(movida, "reserva", "mercado", 1, {
			onEmpty: "stop",
		});
		return {
			...reposta,
			events: appendEvent(
				reposta.events,
				"carta_comprada",
				{ carta, definicao: def.id, custo: def.custo },
				{ cause },
			),
		};
	});
}

function fimDeTurno(state: DeckState): DeckState {
	const acabou = terminou(state);
	let engine = state.engine;
	for (const zona of ["mao", "jogadas"] as const) {
		for (const carta of cardsOf(engine, zona)) {
			engine = moveCard(engine, carta, zona, "descarte");
		}
	}
	if (acabou) return encerrar({ ...state, engine });
	engine = drawCards(engine, "baralho", "mao", TAMANHO_MAO, {
		onEmpty: "reshuffle-from",
		source: "descarte",
	});
	return entradaDe({ ...state, engine: advancePhase(engine, ESCOPOS) }, "acao");
}

export const ESCOPOS = createScopeRegistry([
	{ id: "turn" },
	{ id: "phase", within: "turn" },
]);

export const TRANSICOES: readonly Transition<DeckState, DeckAction>[] = [
	{ from: "preparo", on: "COMECAR", to: "acao" },
	{ from: "acao", on: "ENCERRAR_ACAO", to: "compra" },
	{
		from: "compra",
		on: "ENCERRAR_TURNO",
		to: "acao",
		guard: (state) => !terminou(state),
	},
	{
		from: "compra",
		on: "ENCERRAR_TURNO",
		to: "fim",
		guard: (state) => terminou(state),
	},
];

export const fluxoDeck: FluxoDeck = createPhaseFlow<
	DeckState,
	DeckAction,
	AmbienteDeck
>({
	phaseOf: (state) => state.game.fase,
	handlers: [preparo, acao, compra],
	transitions: TRANSICOES,
	onInvalidTransition: "reject",
});

export const RESERVA = [
	"prata",
	"ferreiro",
	"ducado",
	"feira",
	"tapete",
	"ducado",
	"ouro",
	"reino",
	"prata",
	"tesoureiro",
	"banqueiro",
	"ducado",
	"fornalha",
	"mina",
	"vidente",
];

export const BARALHO_INICIAL = [
	...Array<string>(7).fill("cobre"),
	...Array<string>(3).fill("tapete"),
];

function instancias(
	definicoes: readonly string[],
	prefixo: string,
	owner?: string,
): CardInstance[] {
	return definicoes.map((defId, i) => ({
		id: `${defId}-${prefixo}${i + 1}`,
		defId,
		owner,
	}));
}

export function criarMotorDeck(
	dados: readonly number[] | number,
	conteudo: ConteudoDeck = conteudoDeck,
): MotorDeck {
	return createEngine<
		DeckState,
		CartaDeck,
		HabilidadeDeck,
		Vazio,
		Vazio,
		ConteudoDeck,
		KindsDeck,
		FluxoDeck
	>({
		kinds: createKindRegistryFrom<DeckState, DeckCtx>(
			engineBuiltinKinds<DeckGame, DeckEventMap>(),
			pacoteDeck,
		),
		nodesOf: (habilidade) => habilidade.efeitos,
		ruleset: {
			id: "deckbuilder-solo",
			version: "0.0.1",
			balance: {},
			transitions: {},
			eventRules: {},
		},
		content: conteudo,
		dice: () =>
			typeof dados === "number" ? seededDice(dados) : scriptedDice(dados),
		requirements: { met: () => false },
		scopes: {
			registry: ESCOPOS,
			key: (_s, scope, src) => `${scope}:${src.id}`,
		},
		flow: fluxoDeck,
	});
}

export interface Montagem {
	readonly baralho?: readonly string[];
	readonly reserva?: readonly string[];
	readonly descarte?: readonly string[];
}

export function novaPartidaDeck(
	motor: MotorDeck,
	montagem: Montagem = {},
): DeckState {
	const jogador = instancias(montagem.baralho ?? BARALHO_INICIAL, "", JOGADOR);
	const descartadas = instancias(montagem.descarte ?? [], "d", JOGADOR);
	const reserva = instancias(montagem.reserva ?? RESERVA, "r");
	return {
		engine: createEngineState<DeckEventMap>({
			dice: motor.dice(0),
			players: [JOGADOR],
			cards: [...jogador, ...descartadas, ...reserva],
			zones: [
				{
					id: "baralho",
					owner: JOGADOR,
					visibility: "count",
					cards: jogador.map((c) => c.id),
				},
				{ id: "mao", owner: JOGADOR, visibility: "owner", ordered: false },
				{ id: "jogadas", ordered: false },
				{ id: "descarte", cards: descartadas.map((c) => c.id) },
				{ id: "mercado", ordered: false },
				{ id: "reserva", visibility: "count", cards: reserva.map((c) => c.id) },
			],
		}),
		game: { fase: "preparo" },
	};
}

export function agir(
	motor: MotorDeck,
	state: DeckState,
	action: DeckAction,
): DeckState {
	const resultado = motor.flow.dispatch(state, action, motor);
	if (resultado.rejection && !resultado.rejection.applied) {
		throw new Error(resultado.rejection.message);
	}
	return resultado.state;
}

export function acoesLegais(motor: MotorDeck, state: DeckState): DeckAction[] {
	return motor.flow.legalActions(state, JOGADOR, motor);
}

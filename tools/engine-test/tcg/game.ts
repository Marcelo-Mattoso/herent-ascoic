import { z } from "zod";
import {
	addToCounter,
	answerPending,
	appendEvent,
	type CardInstance,
	type ChoiceAnswer,
	type ContentPort,
	cardsOf,
	checkCosts,
	configureTurns,
	counterOf,
	createEngine,
	createEngineState,
	createKindRegistryFrom,
	createScopeRegistry,
	declareTargets,
	defineKind,
	drawCards,
	type Engine,
	type EngineEventMap,
	engineBuiltinKinds,
	endTurn,
	gainPool,
	type GameState,
	instanceOf,
	activePlayer,
	type KindNode,
	type KindPackage,
	type KindRegistry,
	moveCard,
	nextSeq,
	type PlayerId,
	payCosts,
	poolOf,
	poolRef,
	resolveTargeted,
	resourceCost,
	rollInto,
	runWithChoices,
	type ScopeRegistry,
	scriptedDice,
	seededDice,
	setController,
	startTurns,
	type TargetDeclaration,
	type TargetSelector,
	withEngine,
} from "../../../src/engine";

export interface CartaTcg {
	readonly id: string;
	readonly nome: string;
	readonly custo: number;
	readonly tipo: "criatura" | "feitico";
	readonly poder?: number;
	readonly rapido?: boolean;
	readonly alvo?: TargetSelector;
	readonly efeitos: readonly KindNode[];
}

export interface HabilidadeTcg {
	readonly id: string;
	readonly efeitos: readonly KindNode[];
}

export type FaseTcg = "preparo" | "principal" | "janela" | "fim";

export interface TcgGame {
	readonly regras: string;
	readonly fase: FaseTcg;
	readonly derrotado?: PlayerId;
}

export type TcgEventMap = EngineEventMap & {
	carta_jogada: { jogador: PlayerId; carta: string; definicao: string };
	compra_privada: { jogador: PlayerId; carta: string };
	partida_encerrada: { vencedor: PlayerId };
	janela_fechada: { proxima: string };
};

export type TcgState = GameState<TcgGame, TcgEventMap>;

export interface TcgCtx {
	readonly caster: PlayerId;
	readonly cause?: number;
}

export type KindsTcg = KindRegistry<TcgState, TcgCtx>;

export type MotorTcg = Engine<
	TcgState,
	CartaTcg,
	HabilidadeTcg,
	Record<string, never>,
	Record<string, never>,
	ContentPort<CartaTcg, HabilidadeTcg>,
	KindsTcg
>;

export const JOGADORES = ["a", "b"] as const;
export const VIDA_INICIAL = 10;
export const MANA_POR_TURNO = 2;
export const ESCOPOS: ScopeRegistry = createScopeRegistry([
	{ id: "turn" },
	{ id: "phase", within: "turn" },
]);

const ALVO_CRIATURA_ADVERSARIA: TargetSelector = {
	id: "criatura-adversaria",
	zones: ["campo"],
	controller: "opponent",
	min: 1,
	max: 1,
};

export const catalogo: readonly CartaTcg[] = [
	{
		id: "lobo",
		nome: "Lobo",
		custo: 2,
		tipo: "criatura",
		poder: 2,
		efeitos: [],
	},
	{
		id: "centelha",
		nome: "Centelha",
		custo: 1,
		tipo: "feitico",
		efeitos: [{ kind: "dano_oponente", valor: 2 }],
	},
	{
		id: "raio",
		nome: "Raio",
		custo: 2,
		tipo: "feitico",
		alvo: ALVO_CRIATURA_ADVERSARIA,
		efeitos: [{ kind: "destruir_alvo" }],
	},
	{
		id: "visao",
		nome: "Visão",
		custo: 1,
		tipo: "feitico",
		efeitos: [
			{
				kind: "choose_one",
				options: [
					{ id: "comprar", do: [{ kind: "comprar", quantidade: 1 }] },
					{ id: "curar", do: [{ kind: "curar", valor: 2 }] },
				],
			},
		],
	},
	{
		id: "sorte",
		nome: "Sorte",
		custo: 1,
		tipo: "feitico",
		rapido: true,
		efeitos: [{ kind: "mana_por_dado", faces: 6 }],
	},
	{
		id: "bencao",
		nome: "Bênção",
		custo: 1,
		tipo: "feitico",
		rapido: true,
		efeitos: [{ kind: "curar", valor: 3 }],
	},
];

export const conteudoTcg: ContentPort<CartaTcg, HabilidadeTcg> = {
	card(id) {
		const carta = catalogo.find((c) => c.id === id);
		if (!carta) throw new Error(`Carta fora do catálogo: ${id}`);
		return carta;
	},
	hasCard: (id) => catalogo.some((c) => c.id === id),
	cards: () => catalogo,
	abilitiesOf: (id) => [
		{
			def: { id: `${id}.efeitos`, efeitos: conteudoTcg.card(id).efeitos },
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

export const oponenteDe = (jogador: PlayerId): PlayerId =>
	JOGADORES.find((j) => j !== jogador) as PlayerId;

export function causarDano(
	state: TcgState,
	jogador: PlayerId,
	valor: number,
	cause?: number,
): TcgState {
	const ferido = withEngine(state, (engine) =>
		addToCounter(engine, poolRef(jogador, "vida"), -valor, { cause }),
	);
	if (vidaDe(ferido, jogador) > 0 || ferido.game.derrotado !== undefined) {
		return ferido;
	}
	return { ...ferido, game: { ...ferido.game, derrotado: jogador } };
}

const danoOponente = defineKind<
	TcgState,
	TcgCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"dano_oponente">; valor: z.ZodNumber }>
>({
	kind: "dano_oponente",
	category: "effect",
	schema: z.object({
		kind: z.literal("dano_oponente"),
		valor: z.number().int().min(1),
	}),
	resolve: (state, node, ctx) => ({
		state: causarDano(state, oponenteDe(ctx.caster), node.valor, ctx.cause),
	}),
});

const curar = defineKind<
	TcgState,
	TcgCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"curar">; valor: z.ZodNumber }>
>({
	kind: "curar",
	category: "effect",
	schema: z.object({
		kind: z.literal("curar"),
		valor: z.number().int().min(1),
	}),
	resolve: (state, node, ctx) => ({
		state: withEngine(state, (engine) =>
			addToCounter(engine, poolRef(ctx.caster, "vida"), node.valor, {
				cause: ctx.cause,
			}),
		),
	}),
});

export function comprarPrivado(
	engine: TcgState["engine"],
	jogador: PlayerId,
	quantidade: number,
): TcgState["engine"] {
	let atual = engine;
	for (let i = 0; i < quantidade; i++) {
		const antes = cardsOf(atual, `mao:${jogador}`);
		const comprada = drawCards(atual, `baralho:${jogador}`, `mao:${jogador}`, 1, {
			onEmpty: "stop",
		});
		const depois = cardsOf(comprada, `mao:${jogador}`);
		if (depois.length === antes.length) return comprada;
		atual = {
			...comprada,
			events: appendEvent(
				comprada.events,
				"compra_privada",
				{ jogador, carta: depois[depois.length - 1] },
				{ visibleTo: [jogador] },
			),
		};
	}
	return atual;
}

const comprar = defineKind<
	TcgState,
	TcgCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"comprar">; quantidade: z.ZodNumber }>
>({
	kind: "comprar",
	category: "effect",
	schema: z.object({
		kind: z.literal("comprar"),
		quantidade: z.number().int().min(1),
	}),
	resolve: (state, node, ctx) => ({
		state: withEngine(state, (engine) =>
			comprarPrivado(engine, ctx.caster, node.quantidade),
		),
	}),
});

const manaPorDado = defineKind<
	TcgState,
	TcgCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"mana_por_dado">; faces: z.ZodNumber }>
>({
	kind: "mana_por_dado",
	category: "effect",
	schema: z.object({
		kind: z.literal("mana_por_dado"),
		faces: z.number().int().min(2),
	}),
	resolve: (state, node, ctx) => {
		const rolled = rollInto(state.engine, node.faces, { cause: ctx.cause });
		return {
			state: {
				...state,
				engine: gainPool(rolled.state, ctx.caster, "mana", rolled.value),
			},
		};
	},
});

const declaracaoSchema = z.object({
	selector: z.looseObject({}),
	caster: z.string(),
	targets: z.array(z.string()),
});

const destruirAlvo = defineKind<
	TcgState,
	TcgCtx,
	z.ZodObject<{
		kind: z.ZodLiteral<"destruir_alvo">;
		declaration: z.ZodOptional<typeof declaracaoSchema>;
	}>
>({
	kind: "destruir_alvo",
	category: "effect",
	schema: z.object({
		kind: z.literal("destruir_alvo"),
		declaration: declaracaoSchema.optional(),
	}),
	resolve: (state, node) => {
		if (!node.declaration) throw new Error("destruir_alvo sem alvo declarado");
		const declaration = node.declaration as unknown as TargetDeclaration;
		return {
			state: withEngine(state, (engine) =>
				resolveTargeted(engine, declaration, (current, alvos) =>
					alvos.reduce(
						(acc, carta) => moveCard(acc, carta, "campo", "descarte"),
						current,
					),
				),
			),
		};
	},
});

export const pacoteTcg: KindPackage<TcgState, TcgCtx> = {
	id: "tcg",
	kinds: [danoOponente, curar, comprar, manaPorDado, destruirAlvo],
};

export function criarMotorTcg<TFlow = undefined>(
	dados: readonly number[] | number,
	flow?: TFlow,
): Engine<
	TcgState,
	CartaTcg,
	HabilidadeTcg,
	Record<string, never>,
	Record<string, never>,
	ContentPort<CartaTcg, HabilidadeTcg>,
	KindsTcg,
	TFlow
> {
	return createEngine<
		TcgState,
		CartaTcg,
		HabilidadeTcg,
		Record<string, never>,
		Record<string, never>,
		ContentPort<CartaTcg, HabilidadeTcg>,
		KindsTcg,
		TFlow
	>({
		kinds: createKindRegistryFrom<TcgState, TcgCtx>(
			engineBuiltinKinds<TcgGame, TcgEventMap>(),
			pacoteTcg,
		),
		nodesOf: (habilidade) => habilidade.efeitos,
		ruleset: {
			id: "tcg-1x1-nano",
			version: "0.0.1",
			balance: {},
			transitions: {},
			eventRules: {},
		},
		content: conteudoTcg,
		dice: () =>
			typeof dados === "number" ? seededDice(dados) : scriptedDice(dados),
		requirements: { met: () => false },
		scopes: {
			registry: ESCOPOS,
			key: (_s, scope, src) => `${scope}:${src.id}`,
		},
		flow,
	});
}

export const BARALHO_A = ["centelha", "lobo", "visao", "raio", "sorte"];
export const BARALHO_B = ["lobo", "centelha", "raio", "visao", "sorte"];

function instancias(jogador: PlayerId, baralho: readonly string[]): CardInstance[] {
	const contagem: Record<string, number> = {};
	return baralho.map((definicao) => {
		contagem[definicao] = (contagem[definicao] ?? 0) + 1;
		return {
			id: `${definicao}-${jogador}-${contagem[definicao]}`,
			defId: definicao,
			owner: jogador,
		};
	});
}

export function concederMana(state: TcgState): TcgState {
	return withEngine(state, (engine) =>
		gainPool(engine, activePlayer(engine), "mana", MANA_POR_TURNO),
	);
}

export function montarMesa(
	motor: Pick<MotorTcg, "dice" | "ruleset">,
	baralhos: { a: readonly string[]; b: readonly string[] } = {
		a: BARALHO_A,
		b: BARALHO_B,
	},
	vida = VIDA_INICIAL,
): TcgState {
	const cartasA = instancias("a", baralhos.a);
	const cartasB = instancias("b", baralhos.b);
	return {
		engine: createEngineState<TcgEventMap>({
			dice: motor.dice(0),
			players: [...JOGADORES],
			cards: [...cartasA, ...cartasB],
			zones: [
				{
					id: "baralho:a",
					owner: "a",
					visibility: "count",
					cards: cartasA.map((c) => c.id),
				},
				{
					id: "baralho:b",
					owner: "b",
					visibility: "count",
					cards: cartasB.map((c) => c.id),
				},
				{ id: "mao:a", owner: "a", visibility: "owner", ordered: false },
				{ id: "mao:b", owner: "b", visibility: "owner", ordered: false },
				{ id: "campo", ordered: false },
				{ id: "descarte" },
			],
			counters: JOGADORES.flatMap((j) => [
				{ ...poolRef(j, "vida"), value: vida },
				{ ...poolRef(j, "mana"), value: 0 },
			]),
		}),
		game: { regras: motor.ruleset.id, fase: "preparo" },
	};
}

export function iniciarPartida(state: TcgState, maoInicial = 3): TcgState {
	let engine = state.engine;
	for (const j of JOGADORES) engine = comprarPrivado(engine, j, maoInicial);
	engine = configureTurns(engine, {
		order: [...JOGADORES],
		phases: ["principal"],
	});
	engine = startTurns(engine);
	return concederMana({
		engine,
		game: { ...state.game, fase: "principal" },
	});
}

export function novaPartida(
	motor: MotorTcg,
	baralhos?: { a: readonly string[]; b: readonly string[] },
	maoInicial = 3,
	vida = VIDA_INICIAL,
): TcgState {
	return iniciarPartida(montarMesa(motor, baralhos, vida), maoInicial);
}

export function passarTurno(state: TcgState): TcgState {
	const proximo = withEngine(state, (engine) => endTurn(engine, ESCOPOS));
	const comprou = withEngine(proximo, (engine) =>
		comprarPrivado(engine, activePlayer(engine), 1),
	);
	return concederMana(comprou);
}

export function jogarCarta(
	motor: MotorTcg,
	state: TcgState,
	jogador: PlayerId,
	carta: string,
	alvos: readonly string[] = [],
): TcgState {
	const engine = state.engine;
	if (activePlayer(engine) !== jogador) {
		throw new Error(`Não é o turno de ${jogador}`);
	}
	if (engine.pending) throw new Error("Há uma escolha pendente");
	if (!cardsOf(engine, `mao:${jogador}`).includes(carta)) {
		throw new Error(`Carta ${carta} não está na mão de ${jogador}`);
	}
	const definicao = instanceOf(engine, carta).defId;
	const def = motor.content.card(definicao);
	const custos = [resourceCost<TcgEventMap>("mana", def.custo)];
	const falta = checkCosts(custos, engine, jogador);
	if (!falta.ok) throw new Error(falta.reason);
	const declaracao = def.alvo
		? declareTargets(engine, def.alvo, jogador, alvos)
		: undefined;

	const cause = nextSeq(engine.events);
	let atual = withEngine(state, (e) => payCosts(custos, e, jogador));
	atual = withEngine(atual, (e) => ({
		...e,
		events: appendEvent(e.events, "carta_jogada", { jogador, carta, definicao }),
	}));
	atual = withEngine(atual, (e) =>
		def.tipo === "criatura"
			? setController(
					moveCard(e, carta, `mao:${jogador}`, "campo", { cause }),
					carta,
					jogador,
					{ cause },
				)
			: moveCard(e, carta, `mao:${jogador}`, "descarte", { cause }),
	);
	const efeitos = def.efeitos.map((no) =>
		no.kind === "destruir_alvo" ? { ...no, declaration: declaracao } : no,
	);
	return runWithChoices(motor.kinds, atual, efeitos, { caster: jogador, cause });
}

export function responderEscolha(
	motor: MotorTcg,
	state: TcgState,
	resposta: ChoiceAnswer,
): TcgState {
	return answerPending(motor.kinds, state, resposta, {
		caster: resposta.player,
	});
}

export function vidaDe(state: TcgState, jogador: PlayerId): number {
	return counterOf(state.engine, poolRef(jogador, "vida"));
}

export function manaDe(state: TcgState, jogador: PlayerId): number {
	return poolOf(state.engine, jogador, "mana");
}

export function vencedor(state: TcgState): PlayerId | undefined {
	const caiu =
		state.game.derrotado ?? JOGADORES.find((j) => vidaDe(state, j) <= 0);
	return caiu === undefined ? undefined : oponenteDe(caiu);
}

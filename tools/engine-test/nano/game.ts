import { z } from "zod";
import {
	addToCounter,
	appendEvent,
	type CardInstance,
	type ContentPort,
	type CounterRef,
	cardsOf,
	createEngine,
	createScopeRegistry,
	createEngineState,
	counterOf,
	createKindRegistryFrom,
	defineKind,
	drawCards,
	type Engine,
	engineBuiltinKinds,
	type EngineEventMap,
	type GameState,
	instanceOf,
	type KindNode,
	type KindPackage,
	type KindRegistry,
	moveCard,
	nextSeq,
	rollInto,
	scriptedDice,
	shuffleZone,
	withEngine,
} from "../../../src/engine";

export interface CartaNano {
	readonly id: string;
	readonly nome: string;
	readonly efeitos: readonly KindNode[];
}

export interface HabilidadeNano {
	readonly id: string;
	readonly efeitos: readonly KindNode[];
}

export interface NanoGame {
	readonly regras: string;
}

export type NanoEventMap = EngineEventMap & {
	carta_jogada: { carta: string; definicao: string };
};

export type NanoState = GameState<NanoGame, NanoEventMap>;

export interface NanoCtx {
	readonly cause?: number;
}

export const PONTOS: CounterRef = { scope: "partida", id: "-", name: "pontos" };

export const catalogo: readonly CartaNano[] = [
	{
		id: "faisca",
		nome: "Faísca",
		efeitos: [{ kind: "ganhar_pontos", valor: 2 }],
	},
	{
		id: "sorte",
		nome: "Sorte",
		efeitos: [{ kind: "ganhar_pontos", valor: 1, dado: 6 }],
	},
	{
		id: "estudo",
		nome: "Estudo",
		efeitos: [{ kind: "comprar", quantidade: 1 }],
	},
	{
		id: "tesouro",
		nome: "Tesouro",
		efeitos: [{ kind: "ganhar_pontos", valor: 5 }],
	},
];

export const conteudoNano: ContentPort<CartaNano, HabilidadeNano> = {
	card(id) {
		const carta = catalogo.find((c) => c.id === id);
		if (!carta) throw new Error(`Carta fora do catálogo: ${id}`);
		return carta;
	},
	hasCard: (id) => catalogo.some((c) => c.id === id),
	cards: () => catalogo,
	abilitiesOf: (id) => [
		{
			def: { id: `${id}.efeitos`, efeitos: conteudoNano.card(id).efeitos },
			ref: null,
		},
	],
	ability(id) {
		const carta = catalogo.find((c) => `${c.id}.efeitos` === id);
		if (!carta) throw new Error(`Habilidade inexistente: ${id}`);
		return { id, efeitos: carta.efeitos };
	},
	hasAbility: (id) => catalogo.some((c) => `${c.id}.efeitos` === id),
	text: (key, params) => `${key}:${String(params?.["id"] ?? "")}`,
};

export type KindsNano = KindRegistry<NanoState, NanoCtx>;

export type MotorNano = Engine<
	NanoState,
	CartaNano,
	HabilidadeNano,
	Record<string, never>,
	Record<string, never>,
	ContentPort<CartaNano, HabilidadeNano>,
	KindsNano
>;

export function criarMotorNano(
	dados: readonly number[],
	pacotes: readonly KindPackage<NanoState, NanoCtx>[] = [
		engineBuiltinKinds<NanoGame, NanoEventMap>(),
		pacoteNano,
	],
): MotorNano {
	return createEngine<
		NanoState,
		CartaNano,
		HabilidadeNano,
		Record<string, never>,
		Record<string, never>,
		ContentPort<CartaNano, HabilidadeNano>,
		KindsNano
	>({
		kinds: createKindRegistryFrom<NanoState, NanoCtx>(...pacotes),
		nodesOf: (habilidade) => habilidade.efeitos,
		ruleset: {
			id: "nano",
			version: "0.0.1",
			balance: {},
			transitions: {},
			eventRules: {},
		},
		content: conteudoNano,
		dice: () => scriptedDice(dados),
		requirements: { met: () => false },
		scopes: {
			registry: createScopeRegistry([{ id: "partida" }]),
			key: (_s, scope, src) => `${scope}:${src.id}`,
		},
	});
}

const ganharPontos = defineKind<
	NanoState,
	NanoCtx,
	z.ZodObject<{
		kind: z.ZodLiteral<"ganhar_pontos">;
		valor: z.ZodNumber;
		dado: z.ZodOptional<z.ZodNumber>;
	}>
>({
	kind: "ganhar_pontos",
	category: "effect",
	schema: z.object({
		kind: z.literal("ganhar_pontos"),
		valor: z.number().int(),
		dado: z.number().int().min(1).optional(),
	}),
	resolve: (state, node, ctx) => {
		const meta = { cause: ctx.cause };
		let engine = state.engine;
		let total = node.valor;
		if (node.dado !== undefined) {
			const rolled = rollInto(engine, node.dado, meta);
			engine = rolled.state;
			total += rolled.value;
		}
		return {
			state: { ...state, engine: addToCounter(engine, PONTOS, total, meta) },
		};
	},
});

const comprar = defineKind<
	NanoState,
	NanoCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"comprar">; quantidade: z.ZodNumber }>
>({
	kind: "comprar",
	category: "effect",
	schema: z.object({
		kind: z.literal("comprar"),
		quantidade: z.number().int().min(1),
	}),
	resolve: (state, node) => ({
		state: withEngine(state, (engine) =>
			drawCards(engine, "baralho", "mao", node.quantidade),
		),
	}),
});

const dobrarPontos = defineKind<
	NanoState,
	NanoCtx,
	z.ZodObject<{ kind: z.ZodLiteral<"dobrar_pontos"> }>
>({
	kind: "dobrar_pontos",
	category: "effect",
	schema: z.object({ kind: z.literal("dobrar_pontos") }),
	resolve: (state, _node, ctx) => ({
		state: withEngine(state, (engine) =>
			addToCounter(engine, PONTOS, counterOf(engine, PONTOS), {
				cause: ctx.cause,
			}),
		),
	}),
});

const combo = defineKind<
	NanoState,
	NanoCtx,
	z.ZodObject<{
		kind: z.ZodLiteral<"combo">;
		efeitos: z.ZodArray<z.ZodObject<{ kind: z.ZodString }, z.core.$loose>>;
	}>
>({
	kind: "combo",
	category: "effect",
	schema: z.object({
		kind: z.literal("combo"),
		efeitos: z.array(z.looseObject({ kind: z.string() })),
	}),
	children: (node) => node.efeitos,
	resolve: (state, node) => ({ state, push: node.efeitos }),
});

export const pacoteNano: KindPackage<NanoState, NanoCtx> = {
	id: "nano",
	kinds: [ganharPontos, comprar, dobrarPontos, combo],
};

export const BARALHO_PADRAO = ["faisca", "sorte", "estudo", "tesouro"];

export function novaPartida(
	motor: MotorNano,
	baralho: readonly string[] = BARALHO_PADRAO,
): NanoState {
	const contagem: Record<string, number> = {};
	const cartas: CardInstance[] = baralho.map((definicao) => {
		contagem[definicao] = (contagem[definicao] ?? 0) + 1;
		return { id: `${definicao}-${contagem[definicao]}`, defId: definicao };
	});
	return {
		engine: createEngineState<NanoEventMap>({
			dice: motor.dice(0),
			players: ["p1"],
			cards: cartas,
			zones: [
				{
					id: "baralho",
					visibility: "count",
					cards: cartas.map((carta) => carta.id),
				},
				{ id: "mao", owner: "p1", visibility: "owner", ordered: false },
				{ id: "descarte" },
			],
			counters: [{ ...PONTOS, value: 0 }],
		}),
		game: { regras: motor.ruleset.id },
	};
}

export function embaralhar(state: NanoState): NanoState {
	return withEngine(state, (engine) => shuffleZone(engine, "baralho"));
}

export function comprarCartas(state: NanoState, quantidade: number): NanoState {
	return withEngine(state, (engine) =>
		drawCards(engine, "baralho", "mao", quantidade),
	);
}

export function jogarPrimeira(motor: MotorNano, state: NanoState): NanoState {
	const carta = cardsOf(state.engine, "mao")[0];
	if (carta === undefined) throw new Error("Mão vazia");
	const definicao = instanceOf(state.engine, carta).defId;
	const efeitos = motor.content.card(definicao).efeitos;
	const cause = nextSeq(state.engine.events);
	const jogada = withEngine(state, (engine) => ({
		...engine,
		events: appendEvent(engine.events, "carta_jogada", { carta, definicao }),
	}));
	const movida = withEngine(jogada, (engine) =>
		moveCard(engine, carta, "mao", "descarte", { cause }),
	);
	const resultado = motor.kinds.runAll(movida, efeitos, { cause });
	if (resultado.pending) throw new Error("Escolha pendente inesperada");
	return resultado.state;
}

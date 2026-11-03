import {
	activePlayer,
	addToCounter,
	answerPending,
	appendEvent,
	type ContentPort,
	cardsOf,
	controllerOf,
	counterOf,
	createPhaseFlow,
	declareTargets,
	type Engine,
	endTurn,
	instanceOf,
	legalTargets,
	moveCard,
	nextSeq,
	openWindow,
	type PhaseFlow,
	type PhaseHandler,
	type PlayerId,
	type StackOrder,
	passInWindow,
	payCosts,
	resolveWindow,
	resourceCost,
	respondInWindow,
	setController,
	type Transition,
	windowHolder,
	withEngine,
} from "../../../src/engine";
import {
	catalogo,
	type CartaTcg,
	causarDano,
	comprarPrivado,
	concederMana,
	criarMotorTcg,
	ESCOPOS,
	type HabilidadeTcg,
	iniciarPartida,
	JOGADORES,
	type KindsTcg,
	manaDe,
	oponenteDe,
	type TcgEventMap,
	type TcgState,
	vencedor,
} from "./game";

export type AcaoTcg =
	| { readonly type: "COMECAR" }
	| {
			readonly type: "JOGAR_CRIATURA";
			readonly jogador: PlayerId;
			readonly carta: string;
	  }
	| {
			readonly type: "JOGAR_FEITICO";
			readonly jogador: PlayerId;
			readonly carta: string;
			readonly alvos?: readonly string[];
	  }
	| {
			readonly type: "ATACAR";
			readonly jogador: PlayerId;
			readonly criatura: string;
	  }
	| { readonly type: "ENCERRAR_TURNO"; readonly jogador: PlayerId }
	| {
			readonly type: "RESPONDER";
			readonly jogador: PlayerId;
			readonly carta: string;
			readonly alvos?: readonly string[];
	  }
	| { readonly type: "PASSAR"; readonly jogador: PlayerId }
	| {
			readonly type: "ESCOLHER";
			readonly jogador: PlayerId;
			readonly escolha: string;
			readonly opcoes: readonly string[];
	  };

type Vazio = Record<string, never>;
type ConteudoTcg = ContentPort<CartaTcg, HabilidadeTcg>;

export type AmbienteTcg = Pick<
	Engine<TcgState, CartaTcg, HabilidadeTcg, Vazio, Vazio, ConteudoTcg, KindsTcg>,
	"kinds" | "content"
>;

export type FluxoTcg = PhaseFlow<TcgState, AcaoTcg, AmbienteTcg>;
type Handler = PhaseHandler<TcgState, AcaoTcg, AmbienteTcg>;

const entrou = (carta: string) => ({ scope: "turn", id: carta, name: "entrou" });
const atacou = (carta: string) => ({ scope: "turn", id: carta, name: "atacou" });
const vidaRef = (jogador: PlayerId) => ({
	scope: "player",
	id: jogador,
	name: "vida",
});

function exigirTurno(state: TcgState, jogador: PlayerId): void {
	if (activePlayer(state.engine) !== jogador) {
		throw new Error(`Não é o turno de ${jogador}`);
	}
}

function exigirNaMao(
	state: TcgState,
	jogador: PlayerId,
	carta: string,
	ambiente: AmbienteTcg,
): CartaTcg {
	if (!cardsOf(state.engine, `mao:${jogador}`).includes(carta)) {
		throw new Error(`Carta ${carta} não está na mão de ${jogador}`);
	}
	return ambiente.content.card(instanceOf(state.engine, carta).defId);
}

function comFase(state: TcgState, fase: TcgState["game"]["fase"]): TcgState {
	return { ...state, game: { ...state.game, fase } };
}

function encerrarSeTerminou(
	state: TcgState,
	fase: "principal" | "janela",
): TcgState {
	const ganhador = vencedor(state);
	if (ganhador === undefined) return comFase(state, fase);
	return comFase(
		withEngine(state, (e) => ({
			...e,
			events: appendEvent(e.events, "partida_encerrada", {
				vencedor: ganhador,
			}),
		})),
		"fim",
	);
}

function declarar(
	state: TcgState,
	jogador: PlayerId,
	def: CartaTcg,
	alvos: readonly string[] | undefined,
) {
	return def.alvo
		? declareTargets(state.engine, def.alvo, jogador, alvos ?? [])
		: undefined;
}

function efeitosDe(
	def: CartaTcg,
	declaracao: ReturnType<typeof declarar>,
): CartaTcg["efeitos"] {
	return def.efeitos.map((no) =>
		no.kind === "destruir_alvo" ? { ...no, declaration: declaracao } : no,
	);
}

function exigirMana(state: TcgState, jogador: PlayerId, def: CartaTcg): void {
	if (manaDe(state, jogador) < def.custo) {
		throw new Error(`Recurso "mana" insuficiente (${def.custo})`);
	}
}

function pagarEJogar(
	state: TcgState,
	jogador: PlayerId,
	carta: string,
	def: CartaTcg,
	destino: string,
): TcgState {
	const cause = nextSeq(state.engine.events);
	return withEngine(state, (e) => {
		const pago = payCosts([resourceCost<TcgEventMap>("mana", def.custo)], e, jogador);
		const comEvento = {
			...pago,
			events: appendEvent(pago.events, "carta_jogada", {
				jogador,
				carta,
				definicao: def.id,
			}),
		};
		return moveCard(comEvento, carta, `mao:${jogador}`, destino, { cause });
	});
}

function abrirJanela(
	politica: StackOrder,
	state: TcgState,
	jogador: PlayerId,
	carta: string,
	def: CartaTcg,
	alvos: readonly string[] | undefined,
): TcgState {
	const declaracao = declarar(state, jogador, def, alvos);
	exigirMana(state, jogador, def);
	const jogada = pagarEJogar(state, jogador, carta, def, "descarte");
	const engine = withEngine(jogada, (e) => {
		const aberta = openWindow(e, {
			id: `janela:${nextSeq(e.events)}`,
			cause: "feitico",
			policy: politica,
			opener: jogador,
		});
		const resposta = respondInWindow(
			aberta,
			jogador,
			efeitosDe(def, declaracao),
			"feitico",
		);
		return passInWindow(resposta, jogador).state;
	});
	return comFase(engine, "janela");
}

function depoisDeResolver(state: TcgState): TcgState {
	return state.engine.pending ? state : encerrarSeTerminou(state, "principal");
}

const resolverJanela = (state: TcgState, ambiente: AmbienteTcg): TcgState =>
	resolveWindow(ambiente.kinds, state, (item) => ({ caster: item.player }));

function motivoSemAtaque(
	state: TcgState,
	jogador: PlayerId,
	criatura: string,
): string | undefined {
	if (!cardsOf(state.engine, "campo").includes(criatura)) {
		return `Criatura ${criatura} não está no campo`;
	}
	if (controllerOf(state.engine, criatura) !== jogador) {
		return `Criatura ${criatura} não é de ${jogador}`;
	}
	if (counterOf(state.engine, entrou(criatura)) > 0) {
		return `Criatura ${criatura} entrou neste turno`;
	}
	if (counterOf(state.engine, atacou(criatura)) > 0) {
		return `Criatura ${criatura} já atacou neste turno`;
	}
	return undefined;
}

const preparo: Handler = {
	id: "preparo",
	phases: ["preparo"],
	actions: ["COMECAR"],
	accepts: (state) => state.game.fase === "preparo",
	legalActions: () => [{ type: "COMECAR" }],
	apply: (state) => iniciarPartida(state),
};

const criarPrincipal = (politica: StackOrder): Handler => ({
	id: "principal",
	phases: ["principal"],
	actions: ["JOGAR_CRIATURA", "JOGAR_FEITICO", "ATACAR", "ENCERRAR_TURNO"],
	accepts: (state) => state.game.fase === "principal",
	legalActions: (state, jogador, ambiente) => {
		if (activePlayer(state.engine) !== jogador) return [];
		const acoes: AcaoTcg[] = [];
		for (const carta of cardsOf(state.engine, `mao:${jogador}`)) {
			const def = ambiente.content.card(instanceOf(state.engine, carta).defId);
			if (def.custo > manaDe(state, jogador)) continue;
			if (def.tipo === "criatura") {
				acoes.push({ type: "JOGAR_CRIATURA", jogador, carta });
			} else if (def.alvo) {
				for (const alvo of legalTargets(state.engine, def.alvo, jogador)) {
					acoes.push({ type: "JOGAR_FEITICO", jogador, carta, alvos: [alvo] });
				}
			} else {
				acoes.push({ type: "JOGAR_FEITICO", jogador, carta });
			}
		}
		for (const criatura of cardsOf(state.engine, "campo")) {
			if (motivoSemAtaque(state, jogador, criatura) === undefined) {
				acoes.push({ type: "ATACAR", jogador, criatura });
			}
		}
		acoes.push({ type: "ENCERRAR_TURNO", jogador });
		return acoes;
	},
	apply: (state, acao, ambiente) => {
		switch (acao.type) {
			case "JOGAR_CRIATURA": {
				exigirTurno(state, acao.jogador);
				const def = exigirNaMao(state, acao.jogador, acao.carta, ambiente);
				if (def.tipo !== "criatura") {
					throw new Error(`Carta ${acao.carta} não é criatura`);
				}
				exigirMana(state, acao.jogador, def);
				const jogada = pagarEJogar(state, acao.jogador, acao.carta, def, "campo");
				return withEngine(jogada, (e) =>
					addToCounter(
						setController(e, acao.carta, acao.jogador),
						entrou(acao.carta),
						1,
					),
				);
			}
			case "JOGAR_FEITICO": {
				exigirTurno(state, acao.jogador);
				const def = exigirNaMao(state, acao.jogador, acao.carta, ambiente);
				if (def.tipo !== "feitico") {
					throw new Error(`Carta ${acao.carta} não é feitiço`);
				}
				return abrirJanela(
					politica,
					state,
					acao.jogador,
					acao.carta,
					def,
					acao.alvos,
				);
			}
			case "ATACAR": {
				exigirTurno(state, acao.jogador);
				const motivo = motivoSemAtaque(state, acao.jogador, acao.criatura);
				if (motivo) throw new Error(motivo);
				const poder = ambiente.content.card(
					instanceOf(state.engine, acao.criatura).defId,
				).poder as number;
				const marcada = withEngine(state, (e) =>
					addToCounter(e, atacou(acao.criatura), 1),
				);
				return encerrarSeTerminou(
					causarDano(marcada, oponenteDe(acao.jogador), poder),
					"principal",
				);
			}
			case "ENCERRAR_TURNO": {
				exigirTurno(state, acao.jogador);
				const proximo = withEngine(state, (e) => endTurn(e, ESCOPOS));
				return concederMana(
					withEngine(proximo, (e) => comprarPrivado(e, activePlayer(e), 1)),
				);
			}
			default:
				throw new Error(acao.type);
		}
	},
});

const janela: Handler = {
	id: "janela",
	phases: ["janela"],
	actions: ["RESPONDER", "PASSAR"],
	accepts: (state) => state.game.fase === "janela",
	onExit: (state) =>
		withEngine(state, (e) => ({
			...e,
			events: appendEvent(e.events, "janela_fechada", {
				proxima: state.game.fase,
			}),
		})),
	legalActions: (state, jogador, ambiente) => {
		const aberta = state.engine.window;
		if (!aberta || aberta.resolving || windowHolder(aberta) !== jogador) {
			return [];
		}
		const acoes: AcaoTcg[] = [];
		for (const carta of cardsOf(state.engine, `mao:${jogador}`)) {
			const def = ambiente.content.card(instanceOf(state.engine, carta).defId);
			if (!def.rapido || def.custo > manaDe(state, jogador)) continue;
			if (def.alvo) {
				for (const alvo of legalTargets(state.engine, def.alvo, jogador)) {
					acoes.push({ type: "RESPONDER", jogador, carta, alvos: [alvo] });
				}
			} else {
				acoes.push({ type: "RESPONDER", jogador, carta });
			}
		}
		acoes.push({ type: "PASSAR", jogador });
		return acoes;
	},
	apply: (state, acao, ambiente) => {
		if (acao.type === "RESPONDER") {
			const def = exigirNaMao(state, acao.jogador, acao.carta, ambiente);
			if (!def.rapido) throw new Error(`Carta ${acao.carta} não é rápida`);
			const declaracao = declarar(state, acao.jogador, def, acao.alvos);
			exigirMana(state, acao.jogador, def);
			const jogada = pagarEJogar(
				state,
				acao.jogador,
				acao.carta,
				def,
				"descarte",
			);
			return withEngine(jogada, (e) =>
				respondInWindow(e, acao.jogador, efeitosDe(def, declaracao), "resposta"),
			);
		}
		if (acao.type !== "PASSAR") throw new Error(acao.type);
		const passe = passInWindow(state.engine, acao.jogador);
		const depois = { ...state, engine: passe.state };
		if (!passe.closed) return depois;
		return depoisDeResolver(resolverJanela(depois, ambiente));
	},
};

const escolha: Handler = {
	id: "escolha",
	phases: ["janela"],
	actions: ["ESCOLHER"],
	exclusive: true,
	accepts: (state) => state.engine.pending !== undefined,
	blocks: (state, acao) =>
		state.engine.pending !== undefined && acao.type !== "ESCOLHER",
	legalActions: (state, jogador) => {
		const pendente = state.engine.pending?.choice;
		if (!pendente || pendente.player !== jogador || pendente.max !== 1) {
			return [];
		}
		return pendente.options.map((opcao) => ({
			type: "ESCOLHER",
			jogador,
			escolha: pendente.id,
			opcoes: [opcao],
		}));
	},
	apply: (state, acao, ambiente) => {
		if (acao.type !== "ESCOLHER") throw new Error(acao.type);
		const respondido = answerPending(
			ambiente.kinds,
			state,
			{ choice: acao.escolha, player: acao.jogador, picks: acao.opcoes },
			{ caster: acao.jogador },
		);
		const seguinte =
			respondido.engine.window?.resolving && !respondido.engine.pending
				? resolverJanela(respondido, ambiente)
				: respondido;
		return depoisDeResolver(seguinte);
	},
};

export const TRANSICOES_TCG: readonly Transition<TcgState, AcaoTcg>[] = [
	{ from: "preparo", on: "COMECAR", to: "principal" },
	{ from: "principal", on: "JOGAR_FEITICO", to: "janela" },
	{
		from: "principal",
		on: "ATACAR",
		to: "fim",
		guard: (state, acao) =>
			acao.type === "ATACAR" &&
			counterOf(state.engine, vidaRef(oponenteDe(acao.jogador))) <=
				(catalogo.find(
					(c) => c.id === instanceOf(state.engine, acao.criatura).defId,
				)?.poder ?? 0),
	},
	{ from: "janela", on: "PASSAR", to: "principal" },
	{ from: "janela", on: "PASSAR", to: "fim" },
	{ from: "janela", on: "ESCOLHER", to: "principal" },
	{ from: "janela", on: "ESCOLHER", to: "fim" },
];

export function criarFluxoTcg(politica: StackOrder): FluxoTcg {
	return createPhaseFlow<TcgState, AcaoTcg, AmbienteTcg>({
		phaseOf: (state) => state.game.fase,
		handlers: [escolha, preparo, criarPrincipal(politica), janela],
		transitions: TRANSICOES_TCG,
		onInvalidTransition: "reject",
	});
}

export const fluxoTcg: FluxoTcg = criarFluxoTcg("lifo");

export function criarMotorTcgFluxo(
	dados: readonly number[] | number,
	politica: StackOrder = "lifo",
) {
	return criarMotorTcg(
		dados,
		politica === "lifo" ? fluxoTcg : criarFluxoTcg(politica),
	);
}

export type MotorTcgFluxo = ReturnType<typeof criarMotorTcgFluxo>;

export function agirTcg(
	motor: MotorTcgFluxo,
	state: TcgState,
	acao: AcaoTcg,
): TcgState {
	const resultado = motor.flow.dispatch(state, acao, motor);
	if (resultado.rejection && !resultado.rejection.applied) {
		throw new Error(resultado.rejection.message);
	}
	return resultado.state;
}

export function quemDecide(state: TcgState): PlayerId {
	const aberta = state.engine.window;
	if (aberta && !aberta.resolving) return windowHolder(aberta);
	if (state.engine.pending) return state.engine.pending.choice.player;
	return state.engine.turn.order.length > 0
		? activePlayer(state.engine)
		: JOGADORES[0];
}

export function acoesLegaisTcg(
	motor: MotorTcgFluxo,
	state: TcgState,
	jogador: PlayerId = quemDecide(state),
): AcaoTcg[] {
	return motor.flow.legalActions(state, jogador, motor);
}

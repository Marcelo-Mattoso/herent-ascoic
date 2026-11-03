import { describe, expect, it } from "vitest";
import {
	activePlayer,
	cardsOf,
	eventsOfType,
	project,
	remainingScripted,
} from "../../../src/engine";
import {
	type AcaoTcg,
	acoesLegaisTcg,
	agirTcg,
	criarMotorTcgFluxo,
	fluxoTcg,
	quemDecide,
	TRANSICOES_TCG,
} from "./fluxo";
import {
	manaDe,
	montarMesa,
	type TcgState,
	vencedor,
	vidaDe,
} from "./game";
import { BARALHO_A, BARALHO_B, DADOS_ROTEIRO, ROTEIRO, VIDA_ROTEIRO } from "./roteiro";

const motor = criarMotorTcgFluxo(DADOS_ROTEIRO);

const COMECAR: AcaoTcg = { type: "COMECAR" };
const criatura = (jogador: string, carta: string): AcaoTcg => ({
	type: "JOGAR_CRIATURA",
	jogador,
	carta,
});
const feitico = (
	jogador: string,
	carta: string,
	alvos?: readonly string[],
): AcaoTcg => ({ type: "JOGAR_FEITICO", jogador, carta, alvos });
const atacar = (jogador: string, criatura: string): AcaoTcg => ({
	type: "ATACAR",
	jogador,
	criatura,
});
const responder = (jogador: string, carta: string): AcaoTcg => ({
	type: "RESPONDER",
	jogador,
	carta,
});
const passar = (jogador: string): AcaoTcg => ({ type: "PASSAR", jogador });
const fim = (jogador: string): AcaoTcg => ({
	type: "ENCERRAR_TURNO",
	jogador,
});

function rodar(inicial: TcgState, ...acoes: AcaoTcg[]): TcgState {
	return acoes.reduce((s, a) => agirTcg(motor, s, a), inicial);
}

function mesa(): TcgState {
	return montarMesa(motor, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
}

describe("TCG 1x1: partida completa pelo fluxo de handlers", () => {
	it("a tabela de transições e os handlers definem o fluxo", () => {
		expect(TRANSICOES_TCG.map((t) => `${t.from}-${t.on}->${t.to}`)).toEqual([
			"preparo-COMECAR->principal",
			"principal-JOGAR_FEITICO->janela",
			"principal-ATACAR->fim",
			"janela-PASSAR->principal",
			"janela-PASSAR->fim",
			"janela-ESCOLHER->principal",
			"janela-ESCOLHER->fim",
		]);
		expect(fluxoTcg.handlers.map((h) => h.id)).toEqual([
			"escolha",
			"preparo",
			"principal",
			"janela",
		]);
		expect(fluxoTcg.targetsFrom("janela")).toEqual(["principal", "fim"]);
	});

	it("B vence no turno 8; a resposta LIFO salva B no turno 3", () => {
		let s = mesa();
		expect(s.game.fase).toBe("preparo");
		expect(acoesLegaisTcg(motor, s)).toEqual([COMECAR]);
		s = agirTcg(motor, s, COMECAR);
		expect(s.game.fase).toBe("principal");
		expect(activePlayer(s.engine)).toBe("a");
		expect(cardsOf(s.engine, "mao:a")).toEqual([
			"lobo-a-1",
			"centelha-a-1",
			"centelha-a-2",
		]);
		expect(cardsOf(s.engine, "mao:b")).toEqual([
			"lobo-b-1",
			"centelha-b-1",
			"bencao-b-1",
		]);
		expect(manaDe(s, "a")).toBe(2);

		s = rodar(s, criatura("a", "lobo-a-1"), fim("a"));
		expect(manaDe(s, "a")).toBe(0);
		expect(activePlayer(s.engine)).toBe("b");
		expect(manaDe(s, "b")).toBe(2);
		expect(cardsOf(s.engine, "mao:b")).toContain("sorte-b-1");
		s = rodar(s, fim("b"));

		// Turno 3 (A): ataque com o lobo, depois duas Centelhas.
		expect(activePlayer(s.engine)).toBe("a");
		s = rodar(s, atacar("a", "lobo-a-1"));
		expect(vidaDe(s, "b")).toBe(4);
		expect(() => agirTcg(motor, s, atacar("a", "lobo-a-1"))).toThrow(
			/já atacou/,
		);

		s = rodar(s, feitico("a", "centelha-a-1"));
		expect(s.game.fase).toBe("janela");
		expect(quemDecide(s)).toBe("b");
		expect(acoesLegaisTcg(motor, s).map((a) => a.type)).toEqual([
			"RESPONDER",
			"RESPONDER",
			"PASSAR",
		]);
		s = rodar(s, responder("b", "sorte-b-1"), passar("b"), passar("a"));
		expect(s.game.fase).toBe("principal");
		expect(remainingScripted(s.engine.dice)).toBe(0);
		expect(manaDe(s, "b")).toBe(6);
		expect(vidaDe(s, "b")).toBe(2);

		s = rodar(s, feitico("a", "centelha-a-2"));
		s = rodar(s, responder("b", "bencao-b-1"), passar("b"), passar("a"));
		expect(vidaDe(s, "b")).toBe(3);
		expect(s.game.derrotado).toBeUndefined();
		expect(manaDe(s, "b")).toBe(5);
		expect(manaDe(s, "a")).toBe(0);
		const resolvidas = eventsOfType(s.engine.events, "janela.resolvida");
		expect(resolvidas.map((e) => e.payload.order)).toEqual(["lifo", "lifo"]);
		expect(eventsOfType(s.engine.events, "janela_fechada")).toHaveLength(2);
		s = rodar(s, fim("a"));

		// Turno 4 (B): Lobo, Raio no Lobo de A e Centelha.
		expect(activePlayer(s.engine)).toBe("b");
		expect(manaDe(s, "b")).toBe(7);
		s = rodar(
			s,
			criatura("b", "lobo-b-1"),
			feitico("b", "raio-b-1", ["lobo-a-1"]),
			passar("a"),
		);
		expect(cardsOf(s.engine, "campo")).toEqual(["lobo-b-1"]);
		s = rodar(s, feitico("b", "centelha-b-1"), passar("a"));
		expect(vidaDe(s, "a")).toBe(4);
		expect(manaDe(s, "b")).toBe(2);
		s = rodar(s, fim("b"));

		// Turno 5 (A): Visão com escolha, depois Centelha comprada.
		expect(cardsOf(s.engine, "mao:a")).toEqual([
			"raio-a-1",
			"visao-a-1",
		]);
		s = rodar(s, feitico("a", "visao-a-1"), passar("b"));
		expect(s.game.fase).toBe("janela");
		expect(s.engine.pending?.choice).toMatchObject({
			id: "choose_one",
			player: "a",
			options: ["comprar", "curar"],
		});
		expect(acoesLegaisTcg(motor, s)).toEqual([
			{ type: "ESCOLHER", jogador: "a", escolha: "choose_one", opcoes: ["comprar"] },
			{ type: "ESCOLHER", jogador: "a", escolha: "choose_one", opcoes: ["curar"] },
		]);
		expect(() => agirTcg(motor, s, fim("a"))).toThrow(/bloqueada/);
		expect(() =>
			agirTcg(motor, s, {
				type: "ESCOLHER",
				jogador: "b",
				escolha: "choose_one",
				opcoes: ["curar"],
			}),
		).toThrow(/não decide/);
		s = rodar(s, {
			type: "ESCOLHER",
			jogador: "a",
			escolha: "choose_one",
			opcoes: ["comprar"],
		});
		expect(s.game.fase).toBe("principal");
		expect(s.engine.pending).toBeUndefined();
		expect(cardsOf(s.engine, "mao:a")).toEqual(["raio-a-1", "centelha-a-3"]);
		s = rodar(s, feitico("a", "centelha-a-3"), passar("b"));
		expect(vidaDe(s, "b")).toBe(1);
		s = rodar(s, fim("a"));

		// Turno 6 (B): Centelha em A.
		s = rodar(s, feitico("b", "centelha-b-2"), passar("a"));
		expect(vidaDe(s, "a")).toBe(2);
		s = rodar(s, fim("b"));

		// Turno 7 (A): joga o Lobo e passa.
		s = rodar(s, criatura("a", "lobo-a-2"), fim("a"));
		expect(vidaDe(s, "b")).toBe(1);

		// Turno 8 (B): Centelha final; A não tem resposta.
		expect(s.engine.turn.turn).toBe(8);
		s = rodar(s, feitico("b", "centelha-b-3"), passar("a"));
		expect(vidaDe(s, "a")).toBe(0);
		expect(s.game.fase).toBe("fim");
		expect(s.game.derrotado).toBe("a");
		expect(vencedor(s)).toBe("b");
		expect(eventsOfType(s.engine.events, "partida_encerrada")).toEqual([
			expect.objectContaining({ payload: { vencedor: "b" } }),
		]);
		expect(acoesLegaisTcg(motor, s)).toEqual([]);
		expect(() => agirTcg(motor, s, fim("b"))).toThrow(/Nenhum handler/);
		expect(project(s.engine, "a").players).toEqual(["a", "b"]);
	});

	it("com política FIFO a mesma jogada do turno 3 derrota B", () => {
		const fifo = criarMotorTcgFluxo(DADOS_ROTEIRO, "fifo");
		let s = montarMesa(fifo, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
		const jogar = (...acoes: AcaoTcg[]) => {
			s = acoes.reduce((atual, a) => agirTcg(fifo, atual, a), s);
		};
		jogar(
			COMECAR,
			criatura("a", "lobo-a-1"),
			fim("a"),
			fim("b"),
			atacar("a", "lobo-a-1"),
			feitico("a", "centelha-a-1"),
			responder("b", "sorte-b-1"),
			passar("b"),
			passar("a"),
			feitico("a", "centelha-a-2"),
			responder("b", "bencao-b-1"),
			passar("b"),
			passar("a"),
		);
		expect(vidaDe(s, "b")).toBe(3);
		expect(s.game.derrotado).toBe("b");
		expect(s.game.fase).toBe("fim");
		expect(vencedor(s)).toBe("a");
	});

	it("o roteiro linear reproduz a partida e termina com B vencendo", () => {
		const final = rodar(mesa(), ...ROTEIRO);
		expect(final.game.fase).toBe("fim");
		expect(vencedor(final)).toBe("b");
		expect(vidaDe(final, "b")).toBe(1);
		expect(final.engine.turn.turn).toBe(8);
		expect(remainingScripted(final.engine.dice)).toBe(0);
	});
});

import { describe, expect, it } from "vitest";
import {
	cardsOf,
	eventsOfType,
	type PlayerId,
	project,
} from "../../../src/engine";
import {
	acoesLegaisTcg,
	agirTcg,
	criarMotorTcgFluxo,
	quemDecide,
} from "./fluxo";
import {
	JOGADORES,
	manaDe,
	montarMesa,
	oponenteDe,
	type TcgState,
	vencedor,
} from "./game";
import {
	BARALHO_A,
	BARALHO_B,
	DADOS_ROTEIRO,
	ROTEIRO,
	VIDA_ROTEIRO,
} from "./roteiro";

const motor = criarMotorTcgFluxo(DADOS_ROTEIRO);

function vazaMao(state: TcgState, espiao: PlayerId): string[] {
	const alvo = oponenteDe(espiao);
	const json = JSON.stringify(project(state.engine, espiao));
	return cardsOf(state.engine, `mao:${alvo}`).filter((carta) =>
		json.includes(`"${carta}"`),
	);
}

describe("TCG 1x1: projeção por jogador", () => {
	it("a mão do oponente nunca aparece, passo a passo, na partida inteira", () => {
		let s = montarMesa(motor, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
		let verificados = 0;
		for (const acao of ROTEIRO) {
			s = agirTcg(motor, s, acao);
			for (const espiao of JOGADORES) {
				expect(vazaMao(s, espiao)).toEqual([]);
				const visao = project(s.engine, espiao);
				const oponente = oponenteDe(espiao);
				const mao = visao.zones[`mao:${oponente}`];
				if (mao) {
					expect(mao.cards).toBeNull();
					expect(mao.count).toBe(cardsOf(s.engine, `mao:${oponente}`).length);
				}
				const propria = visao.zones[`mao:${espiao}`];
				expect(propria?.cards?.map((c) => c.id)).toEqual(
					cardsOf(s.engine, `mao:${espiao}`),
				);
				verificados++;
			}
		}
		expect(verificados).toBe(ROTEIRO.length * 2);
		expect(vencedor(s)).toBe("b");
	});

	it("eventos visibleTo: a compra privada só chega ao dono; a movida do oponente sai com carta oculta", () => {
		let s = montarMesa(motor, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
		s = agirTcg(motor, s, ROTEIRO[0]);
		const privadas = eventsOfType(s.engine.events, "compra_privada");
		expect(privadas).toHaveLength(6);
		expect(privadas.every((e) => e.visibleTo?.length === 1)).toBe(true);

		const deA = project(s.engine, "a");
		const deB = project(s.engine, "b");
		const privadasA = eventsOfType(deA.events, "compra_privada");
		const privadasB = eventsOfType(deB.events, "compra_privada");
		expect(privadasA.map((e) => e.payload.carta)).toEqual([
			"lobo-a-1",
			"centelha-a-1",
			"centelha-a-2",
		]);
		expect(privadasB.map((e) => e.payload.carta)).toEqual([
			"lobo-b-1",
			"centelha-b-1",
			"bencao-b-1",
		]);

		const compraDeA = deB.events.filter(
			(e) => e.type === "carta.movida" && e.payload.to === "mao:a",
		);
		expect(compraDeA).toHaveLength(3);
		for (const e of compraDeA) {
			expect(e.payload).toMatchObject({ card: "?" });
		}
		const proprias = deA.events.filter(
			(e) => e.type === "carta.movida" && e.payload.to === "mao:a",
		);
		expect(proprias.map((e) => (e.payload as { card: string }).card)).toEqual([
			"lobo-a-1",
			"centelha-a-1",
			"centelha-a-2",
		]);
	});

	it("a carta jogada vira pública e o baralho mostra só a contagem", () => {
		let s = montarMesa(motor, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
		s = agirTcg(motor, s, ROTEIRO[0]);
		s = agirTcg(motor, s, ROTEIRO[1]);
		const deB = project(s.engine, "b");
		expect(deB.zones.campo.cards?.map((c) => c.id)).toEqual(["lobo-a-1"]);
		expect(deB.zones["baralho:a"]).toMatchObject({ cards: null, count: 5 });
		expect(deB.zones["baralho:b"]).toMatchObject({ cards: null, count: 5 });
		expect(deB.cards["lobo-a-1"]).toBeDefined();
		expect(deB.cards["centelha-a-1"]).toBeUndefined();
		expect(deB.counters).toBe(s.engine.counters);
	});

	it("a escolha pendente só mostra as opções a quem decide", () => {
		let s = montarMesa(motor, { a: BARALHO_A, b: BARALHO_B }, VIDA_ROTEIRO);
		for (const acao of ROTEIRO.slice(0, 22)) s = agirTcg(motor, s, acao);
		expect(s.engine.pending?.choice.id).toBe("choose_one");
		expect(quemDecide(s)).toBe("a");
		const deA = project(s.engine, "a");
		const deB = project(s.engine, "b");
		expect(deA.pending).toMatchObject({
			player: "a",
			options: ["comprar", "curar"],
		});
		expect(deB.pending).toMatchObject({ player: "a", options: null });
		expect(JSON.stringify(deB.pending)).not.toContain("comprar");
	});
});

describe("TCG 1x1: jogo aleatório com dados semeados", () => {
	it("ações legais sempre aplicam, a mana não fica negativa e a mão do oponente não vaza", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const m = criarMotorTcgFluxo(seed);
			let s = montarMesa(m, {
				a: ["lobo", "centelha", "visao", "raio", "bencao", "sorte", "lobo", "centelha", "centelha", "raio"],
				b: ["lobo", "raio", "centelha", "bencao", "sorte", "visao", "lobo", "centelha", "centelha", "raio"],
			}, 8);
			const total = Object.keys(s.engine.cards).length;
			let rng = seed * 2246822519;
			const proximo = (n: number) => {
				rng = (Math.imul(rng, 1103515245) + 12345) >>> 0;
				return rng % n;
			};
			let passos = 0;
			while (s.game.fase !== "fim" && passos < 300) {
				const legais = acoesLegaisTcg(m, s);
				expect(legais.length).toBeGreaterThan(0);
				for (const legal of legais) agirTcg(m, s, legal);
				const ofensivas = legais.filter((a) => a.type !== "ENCERRAR_TURNO");
				const pool = proximo(4) === 0 ? legais : ofensivas.length > 0 ? ofensivas : legais;
				s = agirTcg(m, s, pool[proximo(pool.length)]);
				expect(Object.keys(s.engine.cards)).toHaveLength(total);
				expect(new Set(Object.values(s.engine.zones).flatMap((z) => z.cards)).size).toBe(total);
				for (const j of JOGADORES) {
					expect(manaDe(s, j)).toBeGreaterThanOrEqual(0);
					expect(vazaMao(s, j)).toEqual([]);
				}
				passos++;
			}
			if (s.game.fase === "fim") expect(vencedor(s)).toBeDefined();
		}
	});
});

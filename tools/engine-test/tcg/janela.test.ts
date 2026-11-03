import { describe, expect, it } from "vitest";
import {
	eventsOfType,
	openWindow,
	passInWindow,
	project,
	resolveWindow,
	respondInWindow,
	windowHolder,
	withEngine,
} from "../../../src/engine";
import {
	criarMotorTcg,
	jogarCarta,
	manaDe,
	novaPartida,
	type TcgState,
} from "./game";

const SORTE = [{ kind: "mana_por_dado", faces: 6 }] as const;

function janelaComDuasRespostas(
	politica: "fifo" | "lifo" | ((causa: string) => "fifo" | "lifo"),
	dados = [3, 5],
) {
	const motor = criarMotorTcg(dados);
	let s: TcgState = novaPartida(motor);
	s = withEngine(s, (e) =>
		openWindow(e, { id: "resposta", cause: "carta_jogada", policy: politica }),
	);
	expect(windowHolder(s.engine.window!)).toBe("a");
	s = withEngine(s, (e) => respondInWindow(e, "a", SORTE));
	s = withEngine(s, (e) => passInWindow(e, "a").state);
	expect(windowHolder(s.engine.window!)).toBe("b");
	s = withEngine(s, (e) => respondInWindow(e, "b", SORTE));
	expect(s.engine.window?.passes).toBe(0);
	s = withEngine(s, (e) => passInWindow(e, "b").state);
	const fim = passInWindow(s.engine, "a");
	expect(fim.closed).toBe(true);
	return { motor, s: { ...s, engine: fim.state } };
}

describe("TCG 1x1 nano: janela de resposta", () => {
	it("LIFO resolve a última resposta primeiro", () => {
		const { motor, s } = janelaComDuasRespostas("lifo");
		const resolvido = resolveWindow(motor.kinds, s, (item) => ({
			caster: item.player,
		}));
		expect(resolvido.engine.window).toBeUndefined();
		expect(manaDe(resolvido, "b")).toBe(3);
		expect(manaDe(resolvido, "a")).toBe(2 + 5);
		const ordem = eventsOfType(resolvido.engine.events, "janela.resolvida");
		expect(ordem[0]?.payload).toMatchObject({ resolved: 2, order: "lifo" });
	});

	it("FIFO resolve na ordem de chegada", () => {
		const { motor, s } = janelaComDuasRespostas("fifo");
		const resolvido = resolveWindow(motor.kinds, s, (item) => ({
			caster: item.player,
		}));
		expect(manaDe(resolvido, "a")).toBe(2 + 3);
		expect(manaDe(resolvido, "b")).toBe(5);
	});

	it("a política pode vir de uma função por causa (como o event_rules do jogo)", () => {
		const { motor, s } = janelaComDuasRespostas((causa) =>
			causa === "carta_jogada" ? "lifo" : "fifo",
		);
		expect(s.engine.window?.order).toBe("lifo");
		const resolvido = resolveWindow(motor.kinds, s, (item) => ({
			caster: item.player,
		}));
		expect(manaDe(resolvido, "b")).toBe(3);
	});

	it("só quem tem prioridade responde ou passa; janela não abre duas vezes", () => {
		const motor = criarMotorTcg([]);
		const s = novaPartida(motor);
		const aberta = withEngine(s, (e) =>
			openWindow(e, { id: "j", cause: "x", policy: "lifo" }),
		);
		expect(() => respondInWindow(aberta.engine, "b", SORTE)).toThrow(
			/não tem prioridade/,
		);
		expect(() => passInWindow(aberta.engine, "b")).toThrow(/não tem prioridade/);
		expect(() =>
			openWindow(aberta.engine, { id: "k", cause: "x", policy: "lifo" }),
		).toThrow(/Já existe janela/);
		const sem = novaPartida(motor);
		expect(() =>
			resolveWindow(motor.kinds, sem, (item) => ({ caster: item.player })),
		).toThrow(/não está em resolução/);
	});

	it("sem janela, ou já em resolução, ninguém responde nem passa", () => {
		const motor = criarMotorTcg([]);
		const s = novaPartida(motor);
		expect(() => respondInWindow(s.engine, "a", SORTE)).toThrow(
			/Nenhuma janela aberta/,
		);
		let aberta = withEngine(s, (e) =>
			openWindow(e, { id: "j", cause: "x", policy: "lifo" }),
		);
		aberta = withEngine(aberta, (e) => passInWindow(e, "a").state);
		const fechada = passInWindow(aberta.engine, "b").state;
		expect(() => respondInWindow(fechada, "a", SORTE)).toThrow(
			/já está resolvendo/,
		);
	});

	it("passe de todos sem respostas fecha a janela vazia", () => {
		const motor = criarMotorTcg([]);
		let s = withEngine(novaPartida(motor), (e) =>
			openWindow(e, { id: "j", cause: "x", policy: "lifo" }),
		);
		s = withEngine(s, (e) => passInWindow(e, "a").state);
		const fim = passInWindow(s.engine, "b");
		expect(fim.closed).toBe(true);
		const resolvido = resolveWindow(
			motor.kinds,
			{ ...s, engine: fim.state },
			(item) => ({ caster: item.player }),
		);
		expect(resolvido.engine.window).toBeUndefined();
	});
});

describe("TCG 1x1 nano: informação oculta", () => {
	it("a projeção do oponente não vaza a mão, o baralho nem a identidade das compras", () => {
		const motor = criarMotorTcg([]);
		let s = novaPartida(motor);
		const visaoB = project(s.engine, "b");
		expect(visaoB.zones["mao:a"]).toMatchObject({ cards: null, count: 3 });
		expect(visaoB.zones["baralho:a"]).toMatchObject({ cards: null, count: 2 });
		expect(visaoB.zones["mao:b"]?.cards).toHaveLength(3);
		const json = JSON.stringify(visaoB);
		for (const carta of ["centelha-a-1", "lobo-a-1", "visao-a-1", "raio-a-1"]) {
			expect(json).not.toContain(carta);
		}
		const compras = visaoB.events.filter(
			(e) => e.type === "carta.movida" && e.payload.to === "mao:a",
		);
		expect(compras).toHaveLength(3);
		for (const compra of compras) {
			expect(compra.payload).toMatchObject({ card: "?" });
		}

		s = jogarCarta(motor, s, "a", "lobo-a-1");
		const depois = project(s.engine, "b");
		expect(depois.zones.campo?.cards?.map((c) => c.id)).toEqual(["lobo-a-1"]);
		expect(depois.zones["mao:a"]).toMatchObject({ cards: null, count: 2 });
		expect(project(s.engine, "a").zones["mao:a"]?.cards).toHaveLength(2);
	});
});

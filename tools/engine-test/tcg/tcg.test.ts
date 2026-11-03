import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	activePlayer,
	addToCounter,
	poolRef,
	cardsOf,
	controllerOf,
	eventsOfType,
	remainingScripted,
} from "../../../src/engine";
import {
	criarMotorTcg,
	jogarCarta,
	manaDe,
	novaPartida,
	passarTurno,
	responderEscolha,
	vencedor,
	vidaDe,
} from "./game";

describe("TCG 1x1 nano", () => {
	it("não importa src/core e é montado por createEngine", () => {
		const fonte = readFileSync(new URL("./game.ts", import.meta.url), "utf8");
		expect(fonte).not.toMatch(/src\/core|@\/core/);
		expect(fonte).toContain("createEngine");
	});

	it("partida roteirizada de 4 turnos chega ao resultado pré-calculado", () => {
		const motor = criarMotorTcg([4]);
		let s = novaPartida(motor);
		expect(activePlayer(s.engine)).toBe("a");
		expect(manaDe(s, "a")).toBe(2);
		expect(cardsOf(s.engine, "mao:a")).toEqual([
			"centelha-a-1",
			"lobo-a-1",
			"visao-a-1",
		]);

		s = jogarCarta(motor, s, "a", "lobo-a-1");
		expect(cardsOf(s.engine, "campo")).toEqual(["lobo-a-1"]);
		expect(controllerOf(s.engine, "lobo-a-1")).toBe("a");
		expect(manaDe(s, "a")).toBe(0);
		s = passarTurno(s);

		expect(activePlayer(s.engine)).toBe("b");
		expect(cardsOf(s.engine, "mao:b")).toContain("visao-b-1");
		s = jogarCarta(motor, s, "b", "raio-b-1", ["lobo-a-1"]);
		expect(cardsOf(s.engine, "campo")).toEqual([]);
		expect(cardsOf(s.engine, "descarte")).toEqual(["raio-b-1", "lobo-a-1"]);
		s = passarTurno(s);

		expect(activePlayer(s.engine)).toBe("a");
		expect(cardsOf(s.engine, "mao:a")).toContain("raio-a-1");
		s = jogarCarta(motor, s, "a", "visao-a-1");
		expect(s.engine.pending?.choice).toMatchObject({
			id: "choose_one",
			player: "a",
			options: ["comprar", "curar"],
			min: 1,
			max: 1,
		});
		s = responderEscolha(motor, s, {
			choice: "choose_one",
			player: "a",
			picks: ["curar"],
		});
		expect(s.engine.pending).toBeUndefined();
		expect(vidaDe(s, "a")).toBe(12);
		s = jogarCarta(motor, s, "a", "centelha-a-1");
		expect(vidaDe(s, "b")).toBe(8);
		s = passarTurno(s);

		s = jogarCarta(motor, s, "b", "sorte-b-1");
		expect(manaDe(s, "b")).toBe(5);
		s = jogarCarta(motor, s, "b", "lobo-b-1");
		s = jogarCarta(motor, s, "b", "centelha-b-1");

		expect(vidaDe(s, "a")).toBe(10);
		expect(vidaDe(s, "b")).toBe(8);
		expect(manaDe(s, "b")).toBe(2);
		expect(cardsOf(s.engine, "campo")).toEqual(["lobo-b-1"]);
		expect(controllerOf(s.engine, "lobo-b-1")).toBe("b");
		expect(remainingScripted(s.engine.dice)).toBe(0);
		expect(vencedor(s)).toBeUndefined();
		expect(s.engine.turn).toMatchObject({ turn: 4, round: 2 });
	});

	it("recusa jogada fora do turno, sem mana e carta fora da mão", () => {
		const motor = criarMotorTcg([]);
		const s = novaPartida(motor);
		expect(() => jogarCarta(motor, s, "b", "lobo-b-1")).toThrow(/turno de b/);
		const gasto = jogarCarta(motor, s, "a", "lobo-a-1");
		expect(() => jogarCarta(motor, gasto, "a", "centelha-a-1")).toThrow(
			/Recurso "mana" insuficiente/,
		);
		expect(() => jogarCarta(motor, s, "a", "raio-a-1")).toThrow(/não está na mão/);
	});

	it("escolha só aceita o jogador dono, opção válida e bloqueia jogadas", () => {
		const motor = criarMotorTcg([]);
		let s = novaPartida(motor);
		s = jogarCarta(motor, s, "a", "visao-a-1");
		expect(() =>
			responderEscolha(motor, s, { choice: "choose_one", player: "b", picks: ["curar"] }),
		).toThrow(/não decide/);
		expect(() =>
			responderEscolha(motor, s, { choice: "choose_one", player: "a", picks: ["x"] }),
		).toThrow(/inexistente/);
		expect(() =>
			responderEscolha(motor, s, { choice: "choose_one", player: "a", picks: [] }),
		).toThrow(/exige entre 1 e 1/);
		expect(() => jogarCarta(motor, s, "a", "centelha-a-1")).toThrow(/escolha pendente/);
		const comprou = responderEscolha(motor, s, {
			choice: "choose_one",
			player: "a",
			picks: ["comprar"],
		});
		expect(cardsOf(comprou.engine, "mao:a")).toEqual([
			"centelha-a-1",
			"lobo-a-1",
			"raio-a-1",
		]);
	});

	it("alvo ilegal na declaração é recusado e na resolução o efeito não resolve", () => {
		const motor = criarMotorTcg([]);
		let s = novaPartida(motor);
		s = jogarCarta(motor, s, "a", "lobo-a-1");
		s = passarTurno(s);
		expect(() => jogarCarta(motor, s, "b", "raio-b-1")).toThrow(/entre 1 e 1/);
		expect(() => jogarCarta(motor, s, "b", "raio-b-1", ["raio-b-1"])).toThrow(
			/alvo ilegal/,
		);

		const antes = s.engine.events.length;
		const depois = jogarCarta(motor, s, "b", "raio-b-1", ["lobo-a-1"]);
		expect(eventsOfType(depois.engine.events.slice(antes), "alvo.ilegal")).toEqual([]);

		const fizzle = motor.kinds.runAll(
			s,
			[
				{
					kind: "destruir_alvo",
					declaration: {
						selector: motor.content.card("raio").alvo,
						caster: "b",
						targets: ["lobo-a-1"],
					},
				},
				{
					kind: "destruir_alvo",
					declaration: {
						selector: motor.content.card("raio").alvo,
						caster: "b",
						targets: ["lobo-a-1"],
					},
				},
			],
			{ caster: "b" },
		).state;
		expect(cardsOf(fizzle.engine, "campo")).toEqual([]);
		expect(eventsOfType(fizzle.engine.events, "alvo.ilegal")).toHaveLength(1);
	});

	it("vitória é derivada da vida", () => {
		const motor = criarMotorTcg([]);
		let s = novaPartida(motor, {
			a: Array(4).fill("centelha"),
			b: Array(3).fill("lobo"),
		});
		s = {
			...s,
			engine: addToCounter(s.engine, poolRef("b", "vida"), -8),
		};
		s = jogarCarta(motor, s, "a", "centelha-a-1");
		expect(vidaDe(s, "b")).toBe(0);
		expect(vencedor(s)).toBe("a");
	});
});

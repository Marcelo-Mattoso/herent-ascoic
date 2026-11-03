import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	cardsOf,
	counterOf,
	createEngine,
	createScopeRegistry,
	engineBuiltinKinds,
	createKindRegistryFrom,
	instanceOf,
	remainingScripted,
} from "../../../src/engine";
import {
	catalogo,
	comprarCartas,
	conteudoNano,
	pacoteNano,
	type NanoEventMap,
	type NanoGame,
	embaralhar,
	jogarPrimeira,
	criarMotorNano,
	novaPartida,
	PONTOS,
} from "./game";

describe("jogo nano", () => {
	it("é montado via createEngine sem importar src/core", () => {
		const fonte = readFileSync(new URL("./game.ts", import.meta.url), "utf8");
		expect(fonte).not.toMatch(/src\/core|@\/core/);
		expect(fonte).toContain("createEngine");
		expect(criarMotorNano([]).ruleset.id).toBe("nano");
	});

	it("partida curta com dados roteirizados chega ao resultado pré-calculado", () => {
		// embaralhar [faisca,sorte,estudo,tesouro] com 1,1,1 => [sorte,estudo,tesouro,faisca]
		// d6 da carta sorte = 5 => 1 + 5 = 6 pontos
		const motor = criarMotorNano([1, 1, 1, 5]);
		let s = novaPartida(motor);
		s = embaralhar(s);
		expect(cardsOf(s.engine, "baralho")).toEqual([
			"sorte-1",
			"estudo-1",
			"tesouro-1",
			"faisca-1",
		]);
		s = comprarCartas(s, 2);
		s = jogarPrimeira(motor, s);
		s = jogarPrimeira(motor, s);

		expect(counterOf(s.engine, PONTOS)).toBe(6);
		expect(cardsOf(s.engine, "mao")).toEqual(["tesouro-1"]);
		expect(cardsOf(s.engine, "baralho")).toEqual(["faisca-1"]);
		expect(cardsOf(s.engine, "descarte")).toEqual(["sorte-1", "estudo-1"]);
		expect(remainingScripted(s.engine.dice)).toBe(0);
		// 10 eventos, como antes do contrato com seq/cause: só ganharam seq, instâncias e causa.
		expect(s.engine.events).toEqual([
			{ seq: 0, type: "zona.embaralhada", payload: { zone: "baralho" } },
			{
				seq: 1,
				type: "carta.movida",
				payload: { card: "sorte-1", from: "baralho", to: "mao" },
			},
			{
				seq: 2,
				type: "carta.movida",
				payload: { card: "estudo-1", from: "baralho", to: "mao" },
			},
			{
				seq: 3,
				type: "carta_jogada",
				payload: { carta: "sorte-1", definicao: "sorte" },
			},
			{
				seq: 4,
				type: "carta.movida",
				payload: { card: "sorte-1", from: "mao", to: "descarte" },
				cause: 3,
			},
			{
				seq: 5,
				type: "dado.rolado",
				payload: { faces: 6, value: 5 },
				cause: 3,
			},
			{
				seq: 6,
				type: "contador.alterado",
				payload: { counter: PONTOS, delta: 6, value: 6 },
				cause: 3,
			},
			{
				seq: 7,
				type: "carta_jogada",
				payload: { carta: "estudo-1", definicao: "estudo" },
			},
			{
				seq: 8,
				type: "carta.movida",
				payload: { card: "estudo-1", from: "mao", to: "descarte" },
				cause: 7,
			},
			{
				seq: 9,
				type: "carta.movida",
				payload: { card: "tesouro-1", from: "baralho", to: "mao" },
			},
		]);
	});

	it("duas cópias da mesma definição são instâncias independentes", () => {
		const motor = criarMotorNano([]);
		let s = novaPartida(motor, ["tesouro", "tesouro"]);
		s = comprarCartas(s, 2);
		s = jogarPrimeira(motor, s);
		expect(cardsOf(s.engine, "descarte")).toEqual(["tesouro-1"]);
		expect(cardsOf(s.engine, "mao")).toEqual(["tesouro-2"]);
		expect(instanceOf(s.engine, "tesouro-2").defId).toBe("tesouro");
		s = jogarPrimeira(motor, s);
		expect(counterOf(s.engine, PONTOS)).toBe(10);
	});

	it("o estado sobrevive a JSON", () => {
		const s = embaralhar(novaPartida(criarMotorNano([1, 1, 1])));
		expect(JSON.parse(JSON.stringify(s))).toEqual(s);
	});

	it("falta de dado roteirizado falha com mensagem clara", () => {
		expect(() => embaralhar(novaPartida(criarMotorNano([1, 1])))).toThrow(/esgotados/);
	});

	it("kind do jogo inexistente e payload inválido falham no parse", () => {
		const motor = criarMotorNano([]);
		const s = novaPartida(motor);
		expect(() => motor.kinds.run(s, { kind: "voar" }, {})).toThrow(
			/Kind desconhecido: "voar". Registrados: noop, move_card/,
		);
		expect(() =>
			motor.kinds.parse({ kind: "comprar", quantidade: 0 } as never),
		).toThrow(/Kind "comprar" inválido/);
	});

	it("o registro trafega pela engine com kinds próprios do jogo", () => {
		const motor = criarMotorNano([]);
		expect(pacoteNano.kinds.map((k) => k.kind)).toEqual([
			"ganhar_pontos",
			"comprar",
			"dobrar_pontos",
			"combo",
		]);
		for (const kind of pacoteNano.kinds) expect(motor.kinds.has(kind.kind)).toBe(true);
		expect(motor.kinds.has("move_card")).toBe(true);
	});

	it("kinds próprios (dobrar_pontos, combo) e genéricos (change_counter) compõem", () => {
		const motor = criarMotorNano([]);
		const s = novaPartida(motor);
		const r = motor.kinds.runAll(
			s,
			[
				{ kind: "change_counter", counter: PONTOS, delta: 3 },
				{
					kind: "combo",
					efeitos: [
						{ kind: "dobrar_pontos" },
						{ kind: "ganhar_pontos", valor: 1 },
					],
				},
			],
			{},
		);
		expect(counterOf(r.state.engine, PONTOS)).toBe(7);
	});

	it("validação recursiva aceita o catálogo e recusa kind aninhado desconhecido", () => {
		const motor = criarMotorNano([]);
		for (const carta of catalogo) motor.kinds.validateAll(carta.efeitos, carta.id);
		expect(() =>
			motor.kinds.validate(
				{ kind: "combo", efeitos: [{ kind: "dobrar_pontos" }, { kind: "i_advance_dungeon" }] },
				"carta x",
			),
		).toThrow(/carta x > combo\[1\]: kind "i_advance_dungeon" sem implementação registrada/);
	});

	it("createEngine recusa conteúdo cujo kind não está registrado", () => {
		const invalido = {
			...conteudoNano,
			abilitiesOf: () => [
				{ def: { id: "x", efeitos: [{ kind: "voar" }] }, ref: null },
			],
		};
		expect(() =>
			createEngine({
				ruleset: { id: "n", version: "1", balance: {}, transitions: {}, eventRules: {} },
				content: invalido as never,
				dice: () => ({ kind: "scripted", values: [], index: 0 }) as never,
				requirements: { met: () => false },
				scopes: { registry: createScopeRegistry([{ id: "partida" }]), key: () => "k" },
				kinds: createKindRegistryFrom(
					engineBuiltinKinds<NanoGame, NanoEventMap>(),
					pacoteNano,
				) as never,
				nodesOf: (h: never) => (h as { efeitos: never[] }).efeitos,
			}),
		).toThrow(/kind "voar" sem implementação registrada/);
	});

	it("motor sem o pacote do jogo recusa o catálogo do nano", () => {
		expect(() =>
			criarMotorNano([], [engineBuiltinKinds<NanoGame, NanoEventMap>()]),
		).toThrow(/kind "ganhar_pontos" sem implementação registrada/);
	});
});

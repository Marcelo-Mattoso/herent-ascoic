import { describe, expect, it } from "vitest";
import {
	attributeOf,
	type EngineEventMap,
	type EngineState,
	nextSeq,
	unitOf,
} from "../../../src/engine";
import { ARIA, ESPREITADOR, type Rpg } from "./conteudo";
import {
	abrirTurno,
	criarMesa,
	fecharTurno,
	iniciar,
	jogarTurno,
	type Mesa,
	preparar,
} from "./jogo";
import { type PassoRoteiro, roteiroDerrota, roteiroVitoria } from "./roteiro";

interface Linha {
	a: {
		vida: number;
		mana: number;
		armadura: number;
		status: string[];
		recarga: number;
	};
	e: { vida: number; armadura: number; status: string[] };
	eventos: string[];
	rejeicoes?: string[];
}

const ABERTURA = ["turno.iniciado", "etapa.iniciada"];
const ataque = ["habilidade.usada", "dano.proposto", "dano.aplicado"];
const sangra = ["dano.proposto", "dano.aplicado"];

const pa = (
	vida: number,
	mana: number,
	armadura: number,
	status: string[],
	recarga: number,
) => ({ vida, mana, armadura, status, recarga });
const pe = (vida: number) => ({ vida, armadura: 1, status: [] as string[] });

const ate4: Linha[] = [
	{
		a: pa(60, 12, 3, [], 2),
		e: pe(21),
		eventos: [...ABERTURA, "cura.aplicada", "atributo.alterado", ...ataque],
	},
	{
		a: pa(60, 12, 3, ["raiz(2)"], 2),
		e: pe(21),
		eventos: [...ABERTURA, "habilidade.usada", "status.aplicado"],
	},
	{
		a: pa(60, 12, 3, ["raiz(1)"], 1),
		e: pe(14),
		eventos: [...ABERTURA, "cura.aplicada", "acao.bloqueada", ...ataque],
		rejeicoes: ["bloqueada", "cooldown"],
	},
	{
		a: pa(54, 12, 3, ["raiz(1)"], 1),
		e: pe(14),
		eventos: [...ABERTURA, ...ataque],
	},
	{
		a: pa(58, 4, 3, [], 2),
		e: pe(5),
		eventos: [
			...ABERTURA,
			"cura.aplicada",
			"atributo.alterado",
			...ataque,
			"status.removido",
		],
	},
	{ a: pa(52, 4, 3, [], 2), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{
		a: pa(56, 4, 1, ["colera"], 1),
		e: pe(5),
		eventos: [
			...ABERTURA,
			"cura.aplicada",
			"habilidade.usada",
			"area.entrou",
			"status.aplicado",
		],
	},
	{
		a: pa(48, 4, 1, ["colera"], 1),
		e: pe(5),
		eventos: [...ABERTURA, ...ataque],
	},
];

const col = ["colera"];

const tabelaVitoria: Linha[] = [
	...ate4,
	{
		a: pa(43, 4, 1, col, 0),
		e: pe(5),
		eventos: [...ABERTURA, ...sangra, "habilidade.usada", "cura.bloqueada"],
		rejeicoes: ["custo"],
	},
	{ a: pa(35, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{
		a: pa(40, 4, 1, [], 0),
		e: pe(5),
		eventos: [
			...ABERTURA,
			...sangra,
			"habilidade.usada",
			"cura.aplicada",
			"status.removido",
		],
	},
	{ a: pa(32, 4, 1, [], 0), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{
		a: pa(32, 4, 1, [], 0),
		e: pe(0),
		eventos: [...ABERTURA, ...ataque, "unidade.derrotada"],
	},
];

const tabelaDerrota: Linha[] = [
	...ate4,
	{ a: pa(43, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...sangra] },
	{ a: pa(35, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{ a: pa(30, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...sangra] },
	{ a: pa(22, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{ a: pa(17, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...sangra] },
	{ a: pa(9, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...ataque] },
	{ a: pa(4, 4, 1, col, 0), e: pe(5), eventos: [...ABERTURA, ...sangra] },
	{
		a: pa(0, 4, 1, col, 0),
		e: pe(5),
		eventos: [...ABERTURA, ...ataque, "unidade.derrotada"],
	},
];

function fatiaDoTurno(
	engine: EngineState<EngineEventMap>,
	turno: number,
): string[] {
	const inicio = engine.events.find(
		(ev) => ev.type === "turno.iniciado" && ev.payload.turn === turno,
	);
	const fim = engine.events.find(
		(ev) => ev.type === "turno.encerrado" && ev.payload.turn === turno,
	);
	if (!inicio) throw new Error(`turno ${turno} sem início`);
	const limite = fim?.seq ?? nextSeq(engine.events);
	return engine.events
		.filter((ev) => ev.seq >= inicio.seq && ev.seq < limite)
		.map((ev) => ev.type);
}

function statusDe(estado: Rpg, unidade: string): string[] {
	return unitOf(estado.engine, unidade).statuses.map((s) =>
		s.remaining === null ? s.status : `${s.status}(${s.remaining})`,
	);
}

function jogar(
	mesa: Mesa,
	roteiro: readonly PassoRoteiro[],
	tabela: readonly Linha[],
) {
	expect(roteiro).toHaveLength(tabela.length);
	let estado = iniciar(mesa, preparar(mesa));
	let resultado: string | undefined;
	roteiro.forEach((passo, indice) => {
		const rotulo = `R${passo.rodada} ${passo.jogador}`;
		const linha = tabela[indice];
		const jogada = jogarTurno(mesa, estado, passo.tentativas);
		expect(jogada.rejeicoes, rotulo).toEqual(linha.rejeicoes ?? []);
		resultado = jogada.resultado;
		const fechado = resultado ? undefined : fecharTurno(mesa, jogada.estado);
		const depois = fechado?.state ?? jogada.estado;
		const e = depois.engine;
		const c = mesa.catalogo;
		expect(
			{
				a: {
					vida: attributeOf(e, c, ARIA, "vida"),
					mana: attributeOf(e, c, ARIA, "mana"),
					armadura: attributeOf(e, c, ARIA, "armadura"),
					status: statusDe(depois, ARIA),
					recarga: unitOf(e, ARIA).cooldowns.lampejo ?? 0,
				},
				e: {
					vida: attributeOf(e, c, ESPREITADOR, "vida"),
					armadura: attributeOf(e, c, ESPREITADOR, "armadura"),
					status: statusDe(depois, ESPREITADOR),
				},
				eventos: fatiaDoTurno(e, indice + 1),
			},
			rotulo,
		).toEqual({ a: linha.a, e: linha.e, eventos: linha.eventos });
		estado = fechado ? abrirTurno(mesa, fechado) : jogada.estado;
	});
	return { estado, resultado };
}

describe("Margem do Lago Turvo", () => {
	it("vitória: vida, mana, armadura, status, recarga e eventos batem em todo turno", () => {
		const mesa = criarMesa();
		const { estado, resultado } = jogar(mesa, roteiroVitoria, tabelaVitoria);
		expect(resultado).toBe("vitoria");
		expect(estado.engine.turn.round).toBe(7);
		const e = estado.engine;
		expect(attributeOf(e, mesa.catalogo, ARIA, "vida")).toBe(32);
		expect(attributeOf(e, mesa.catalogo, ARIA, "vida_max")).toBe(60);
		expect(attributeOf(e, mesa.catalogo, ARIA, "mana")).toBe(4);
		expect(attributeOf(e, mesa.catalogo, ARIA, "armadura")).toBe(1);
		expect(unitOf(e, ARIA).statuses).toEqual([]);
		expect(unitOf(e, ARIA).cooldowns.lampejo ?? 0).toBe(0);
	});

	it("derrota: termina na rodada 8 com o espreitador em 5", () => {
		const mesa = criarMesa();
		const { estado, resultado } = jogar(mesa, roteiroDerrota, tabelaDerrota);
		expect(resultado).toBe("derrota");
		expect(estado.engine.turn.round).toBe(8);
		expect(
			attributeOf(estado.engine, mesa.catalogo, ESPREITADOR, "vida"),
		).toBe(5);
	});

	it("é determinística: duas execuções geram o mesmo estado", () => {
		const roda = () =>
			jogar(criarMesa(), roteiroVitoria, tabelaVitoria).estado;
		expect(JSON.stringify(roda())).toBe(JSON.stringify(roda()));
	});
});

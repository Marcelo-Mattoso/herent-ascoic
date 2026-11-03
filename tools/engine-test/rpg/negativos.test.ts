import { describe, expect, it } from "vitest";
import {
	attributeOf,
	despawnUnit,
	endUnitTurn,
	eventsOfType,
	leaveArea,
	nextSeq,
	runReactive,
	type KindNode,
	unequip,
	equip,
	unitOf,
	useAbility,
} from "../../../src/engine";
import { ARIA, COTA, ESPREITADOR, LAGO, type Rpg } from "./conteudo";
import { criarMesa, escopos, iniciar, type Mesa, preparar } from "./jogo";

function comecar() {
	const mesa = criarMesa();
	return { mesa, estado: iniciar(mesa, preparar(mesa)) };
}

function rodar(mesa: Mesa, estado: Rpg, ...nodes: KindNode[]): Rpg {
	return runReactive(mesa.registro, estado, mesa.catalogo, nodes);
}

function passar(mesa: Mesa, estado: Rpg, turnos = 1): Rpg {
	let atual = estado;
	for (let i = 0; i < turnos; i++) {
		atual = endUnitTurn(mesa.registro, atual, mesa.catalogo, escopos);
	}
	return atual;
}

const novos = (antes: Rpg, depois: Rpg) =>
	depois.engine.events.filter((ev) => ev.seq >= nextSeq(antes.engine.events));

const valor = (mesa: Mesa, estado: Rpg, unidade: string, attr: string) =>
	attributeOf(estado.engine, mesa.catalogo, unidade, attr);

describe("casos negativos do Lago Turvo", () => {
	it("1. Raiz bloqueia mover: rejeitado, sem area.entrou e sem gastar o turno", () => {
		const { mesa, estado } = comecar();
		const enraizada = rodar(mesa, estado, {
			kind: "apply_status",
			target: ARIA,
			status: "raiz",
		});
		const resposta = useAbility(
			mesa.registro,
			enraizada,
			mesa.catalogo,
			ARIA,
			"mover_lago",
		);
		expect(resposta.ok).toBe(false);
		expect(resposta.ok ? "" : resposta.reason).toBe("bloqueada");
		const tipos = novos(enraizada, resposta.state).map((ev) => ev.type);
		expect(tipos).toEqual(["acao.bloqueada"]);
		expect(unitOf(resposta.state.engine, ARIA).presentIn).toEqual([]);
		expect(resposta.state.engine.turn.turn).toBe(enraizada.engine.turn.turn);
		expect(eventsOfType(resposta.state.engine.events, "acao.bloqueada")[0].payload)
			.toEqual({ unit: ARIA, action: "mover", by: "raiz" });
	});

	it("2. cura comum sob Cólera rende 0 e cura.bloqueada; com a tag antidoto passa", () => {
		const { mesa, estado } = comecar();
		const base = rodar(
			mesa,
			estado,
			{ kind: "apply_status", target: ARIA, status: "colera" },
			{ kind: "modify_attribute", target: ARIA, attr: "vida", delta: -30, mode: "atual" },
		);
		const comum = rodar(mesa, base, {
			kind: "heal",
			target: ARIA,
			amount: 15,
			tags: ["pocao"],
		});
		expect(valor(mesa, comum, ARIA, "vida")).toBe(30);
		expect(novos(base, comum).map((ev) => ev.type)).toEqual(["cura.bloqueada"]);
		const antidoto = rodar(mesa, comum, {
			kind: "heal",
			target: ARIA,
			amount: 10,
			tags: ["antidoto"],
		});
		expect(valor(mesa, antidoto, ARIA, "vida")).toBe(40);
		expect(novos(comum, antidoto).map((ev) => ev.type)).toEqual(["cura.aplicada"]);
	});

	it("3. recarga: usado no turno N, rejeitado em N+1, aceito em N+2", () => {
		const { mesa, estado } = comecar();
		const usar = (s: Rpg) =>
			useAbility(mesa.registro, s, mesa.catalogo, ARIA, "lampejo", [ESPREITADOR]);
		const primeira = usar(estado);
		expect(primeira.ok).toBe(true);
		const proximo = passar(mesa, primeira.state, 2);
		const segunda = usar(proximo);
		expect(segunda.ok).toBe(false);
		expect(segunda.ok ? "" : segunda.reason).toBe("cooldown");
		const seguinte = passar(mesa, proximo, 2);
		const terceira = usar(seguinte);
		expect(terceira.ok).toBe(true);
		expect(valor(mesa, terceira.state, ARIA, "mana")).toBe(4);
	});

	it("4. mana insuficiente: rejeitado, mana e recarga intactas", () => {
		const { mesa, estado } = comecar();
		const seca = rodar(mesa, estado, {
			kind: "modify_attribute",
			target: ARIA,
			attr: "mana",
			delta: -16,
			mode: "atual",
		});
		const resposta = useAbility(
			mesa.registro,
			seca,
			mesa.catalogo,
			ARIA,
			"lampejo",
			[ESPREITADOR],
		);
		expect(resposta.ok).toBe(false);
		expect(resposta.ok ? "" : resposta.reason).toBe("custo");
		expect(resposta.state).toBe(seca);
		expect(valor(mesa, resposta.state, ARIA, "mana")).toBe(4);
		expect(unitOf(resposta.state.engine, ARIA).cooldowns).toEqual({});
	});

	it("5. imunidade: o espreitador no lago recebe status.imune e fica sem status", () => {
		const { estado } = comecar();
		const imunes = eventsOfType(estado.engine.events, "status.imune");
		expect(imunes.map((ev) => ev.payload)).toEqual([
			{ unit: ESPREITADOR, status: "colera", by: "veneno" },
		]);
		expect(unitOf(estado.engine, ESPREITADOR).statuses).toEqual([]);
	});

	describe("6. a fonte sai e o efeito some sozinho", () => {
		it("desequipar a Cota tira 3 de armadura e 10 de vida máxima, cortando a vida", () => {
			const { mesa, estado } = comecar();
			expect(valor(mesa, estado, ARIA, "armadura")).toBe(3);
			expect(valor(mesa, estado, ARIA, "vida")).toBe(60);
			const nua = unequip(estado.engine, mesa.catalogo, COTA);
			expect(attributeOf(nua, mesa.catalogo, ARIA, "armadura")).toBe(0);
			expect(attributeOf(nua, mesa.catalogo, ARIA, "vida_max")).toBe(50);
			expect(attributeOf(nua, mesa.catalogo, ARIA, "vida")).toBe(50);
			const cortes = nua.events.filter(
				(ev) => ev.type === "atributo.alterado" && ev.payload.reason === "corte",
			);
			expect(cortes.at(-1)?.payload).toMatchObject({ attr: "vida", from: 60, to: 50 });
			const vestida = equip(nua, mesa.catalogo, COTA, ARIA);
			expect(attributeOf(vestida, mesa.catalogo, ARIA, "vida_max")).toBe(60);
			expect(attributeOf(vestida, mesa.catalogo, ARIA, "vida")).toBe(50);
		});

		it("sair do lago devolve 2 de armadura, mas a Cólera fica", () => {
			const { mesa, estado } = comecar();
			const dentro = rodar(mesa, estado, {
				kind: "move_to_area",
				target: ARIA,
				area: LAGO,
			});
			expect(valor(mesa, dentro, ARIA, "armadura")).toBe(1);
			const fora = leaveArea(dentro.engine, mesa.catalogo, ARIA, LAGO);
			expect(attributeOf(fora, mesa.catalogo, ARIA, "armadura")).toBe(3);
			expect(unitOf(fora, ARIA).statuses.map((s) => s.status)).toEqual(["colera"]);
		});

		it("remover o lago tira a aura de todos", () => {
			const { mesa, estado } = comecar();
			const dentro = rodar(mesa, estado, {
				kind: "move_to_area",
				target: ARIA,
				area: LAGO,
			});
			expect(valor(mesa, dentro, ESPREITADOR, "armadura")).toBe(1);
			const seco = despawnUnit(dentro.engine, mesa.catalogo, LAGO);
			expect(attributeOf(seco, mesa.catalogo, ARIA, "armadura")).toBe(3);
			expect(attributeOf(seco, mesa.catalogo, ESPREITADOR, "armadura")).toBe(3);
			expect(unitOf(seco, ARIA).presentIn).toEqual([]);
			expect(unitOf(seco, ESPREITADOR).presentIn).toEqual([]);
		});
	});

	it("7. empilhamento: refresh, stack com máximo, replace e ignore", () => {
		const { mesa, estado } = comecar();
		const status = (s: Rpg, id: string) =>
			unitOf(s.engine, ARIA).statuses.find((entry) => entry.status === id);
		const aplicar = (s: Rpg, id: string) =>
			rodar(mesa, s, { kind: "apply_status", target: ARIA, status: id });

		let atual = aplicar(estado, "bruma");
		expect(status(atual, "bruma")?.remaining).toBe(3);
		atual = passar(mesa, atual, 1);
		expect(status(atual, "bruma")?.remaining).toBe(2);
		atual = aplicar(atual, "bruma");
		expect(status(atual, "bruma")).toMatchObject({ stacks: 1, remaining: 3 });

		for (let i = 0; i < 4; i++) atual = aplicar(atual, "fervor");
		expect(status(atual, "fervor")?.stacks).toBe(3);
		expect(valor(mesa, atual, ARIA, "armadura")).toBe(6);

		atual = aplicar(atual, "marca");
		const antes = atual;
		atual = passar(mesa, atual, 2);
		expect(status(atual, "marca")?.remaining).toBe(1);
		atual = aplicar(atual, "marca");
		expect(status(atual, "marca")?.remaining).toBe(2);
		const tipos = novos(antes, atual).map((ev) => ev.type);
		expect(tipos).toContain("status.removido");
		expect(
			eventsOfType(atual.engine.events, "status.removido").at(-1)?.payload.reason,
		).toBe("substituido");

		const colera = aplicar(atual, "colera");
		const repetida = aplicar(colera, "colera");
		expect(unitOf(repetida.engine, ARIA).statuses.filter((s) => s.status === "colera"))
			.toHaveLength(1);
		expect(novos(colera, repetida)).toEqual([]);
	});

	it("8. a Raiz expira no fim do 2º turno do portador, não no turno de quem aplicou", () => {
		const { mesa, estado } = comecar();
		const raiz = (s: Rpg) =>
			unitOf(s.engine, ARIA).statuses.find((entry) => entry.status === "raiz");
		const emE = passar(mesa, estado, 1);
		expect(emE.engine.turn.round).toBe(1);
		const aplicada = rodar(mesa, emE, {
			kind: "apply_status",
			target: ARIA,
			status: "raiz",
			source: ESPREITADOR,
		});
		expect(raiz(aplicada)?.remaining).toBe(2);

		const turnoA2 = passar(mesa, aplicada, 1);
		expect(raiz(turnoA2)?.remaining).toBe(2);
		const turnoE2 = passar(mesa, turnoA2, 1);
		expect(raiz(turnoE2)?.remaining).toBe(1);
		const turnoA3 = passar(mesa, turnoE2, 1);
		expect(raiz(turnoA3)?.remaining).toBe(1);
		const fim = passar(mesa, turnoA3, 1);
		expect(raiz(fim)).toBeUndefined();
		const removido = eventsOfType(fim.engine.events, "status.removido").at(-1);
		expect(removido?.payload).toEqual({ unit: ARIA, status: "raiz", reason: "expirou" });
	});
});

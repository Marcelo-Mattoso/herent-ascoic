import { describe, expect, it } from "vitest";
import {
	activeModifiers,
	attributeOf,
	canUseAbility,
	despawnUnit,
	equip,
	hasUnit,
	isArea,
	leaveArea,
	poolMax,
	unequip,
	unitOf,
	unitsOf,
	useAbility,
} from "../../../src/engine";
import { ARIA, COTA, ESPREITADOR, LAGO, type Rpg } from "./conteudo";
import {
	abrirTurno,
	criarMesa,
	fecharTurno,
	iniciar,
	type Mesa,
	preparar,
	resultadoDe,
	unidadeAtiva,
} from "./jogo";

function semente(seed: number) {
	let s = seed * 2654435761 + 1;
	return (limite: number) => {
		s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
		return s % limite;
	};
}

function verificar(mesa: Mesa, estado: Rpg) {
	const e = estado.engine;
	for (const unit of unitsOf(e)) {
		if (isArea(unit)) continue;
		for (const mod of activeModifiers(e, mesa.catalogo, unit.id)) {
			const { kind, id } = mod.source;
			if (kind === "status") {
				expect(unit.statuses.some((s) => s.status === id)).toBe(true);
			} else if (kind === "item") {
				expect(e.units?.[id]?.equippedTo).toBe(unit.id);
			} else if (kind === "area") {
				expect(hasUnit(e, id) && unit.presentIn.includes(id)).toBe(true);
			} else {
				expect(id).toBe(unit.id);
			}
		}
		for (const area of unit.presentIn) expect(hasUnit(e, area)).toBe(true);
		for (const [pool, stored] of Object.entries(unit.pools)) {
			expect(stored).toBeGreaterThanOrEqual(0);
			expect(stored).toBeLessThanOrEqual(poolMax(e, mesa.catalogo, unit.id, pool));
		}
	}
	const texto = JSON.stringify(e);
	expect(texto).not.toContain('"modifiers"');
	expect(JSON.parse(texto)).toEqual(e);
}

function partida(seed: number) {
	const mesa = criarMesa();
	const sorteio = semente(seed);
	let estado = iniciar(mesa, preparar(mesa));
	let acoes = 0;
	for (let passo = 0; passo < 80 && !resultadoDe(estado); passo++) {
		const e = estado.engine;
		if (sorteio(5) === 0) {
			const lago = hasUnit(e, LAGO);
			const roda = sorteio(4);
			if (roda === 0) {
				estado = {
					...estado,
					engine: unitOf(e, COTA).equippedTo
						? unequip(e, mesa.catalogo, COTA)
						: equip(e, mesa.catalogo, COTA, ARIA),
				};
			} else if (roda === 1 && lago && unitOf(e, ARIA).presentIn.includes(LAGO)) {
				estado = { ...estado, engine: leaveArea(e, mesa.catalogo, ARIA, LAGO) };
			} else if (roda === 2 && lago && sorteio(3) === 0) {
				estado = { ...estado, engine: despawnUnit(e, mesa.catalogo, LAGO) };
			}
			verificar(mesa, estado);
		}
		const unidade = unidadeAtiva(estado);
		const alvo = unidade === ARIA ? ESPREITADOR : ARIA;
		const legais = mesa.catalogo
			.unitDef(unitOf(estado.engine, unidade).def)
			.abilities.filter(
				(id) =>
					(id !== "mover_lago" || hasUnit(estado.engine, LAGO)) &&
					canUseAbility(estado.engine, mesa.catalogo, unidade, id, [alvo]).ok,
			);
		const escolha = sorteio(legais.length + 1);
		if (escolha < legais.length) {
			const resposta = useAbility(
				mesa.registro,
				estado,
				mesa.catalogo,
				unidade,
				legais[escolha],
				[alvo],
			);
			expect(resposta.ok).toBe(true);
			estado = resposta.state;
			acoes++;
		}
		verificar(mesa, estado);
		if (resultadoDe(estado)) break;
		estado = abrirTurno(mesa, fecharTurno(mesa, estado));
		verificar(mesa, estado);
	}
	return { estado, acoes };
}

describe("partidas aleatórias de ações legais", () => {
	it("40 sementes: sem erro e nenhum modificador sobrevive à fonte", () => {
		let acoes = 0;
		let terminadas = 0;
		for (let seed = 1; seed <= 40; seed++) {
			const final = partida(seed);
			acoes += final.acoes;
			if (resultadoDe(final.estado)) terminadas++;
			expect(attributeOf(final.estado.engine, criarMesa().catalogo, ARIA, "vida"))
				.toBeGreaterThanOrEqual(0);
		}
		expect(acoes).toBeGreaterThan(200);
		expect(terminadas).toBeGreaterThan(5);
	});

	it("a mesma semente repete a mesma partida", () => {
		expect(JSON.stringify(partida(7).estado)).toBe(
			JSON.stringify(partida(7).estado),
		);
	});
});

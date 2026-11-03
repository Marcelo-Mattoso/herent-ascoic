import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadScenarios,
	matchPartial,
	parseScenario,
	registro,
	runScenario,
} from "./runner";

const dir = path.join(import.meta.dirname, "cases");
const cenarios = loadScenarios(dir);

describe("cenários Given/When/Then por kind genérico", () => {
	for (const { file, scenario } of cenarios) {
		it(`${file}: ${scenario.name}`, () => {
			runScenario(scenario);
		});
	}

	it("há ao menos um cenário para cada kind genérico da engine", () => {
		const cobertos = new Set(cenarios.map(({ scenario }) => scenario.kind));
		const faltando = registro.kinds().filter((kind) => !cobertos.has(kind));
		expect(faltando).toEqual([]);
	});

	it("há cenário de recusa de kind não registrado e de payload inválido", () => {
		const erros = cenarios
			.filter(({ scenario }) =>
				["nao_registrado", "payload_invalido"].includes(scenario.kind),
			)
			.map(({ scenario }) => scenario.then.error);
		expect(erros).toEqual(
			expect.arrayContaining([
				"Kind desconhecido",
				expect.stringContaining("sem implementação registrada"),
				"inválido",
			]),
		);
	});
});

describe("runner de cenários", () => {
	const base = (then: string) => `
name: base
kind: change_counter
given:
  counters: [{ scope: jogo, id: "-", name: pontos, value: 1 }]
when:
  - run: [{ kind: change_counter, counter: { scope: jogo, id: "-", name: pontos }, delta: 2 }]
then:
${then}
`;

	it("falha quando o estado esperado diverge", () => {
		const errado = parseScenario(
			base('  counters: { "jogo:-:pontos": 99 }'),
			"inline",
		);
		expect(() => runScenario(errado)).toThrow(/esperado 99, obtido 3/);
	});

	it("falha quando os eventos esperados divergem em quantidade ou payload", () => {
		const poucos = parseScenario(base("  events: []"), "inline");
		expect(() => runScenario(poucos)).toThrow(/array de 0/);
		const payload = parseScenario(
			base("  events:\n    - { type: contador.alterado, payload: { delta: 9 } }"),
			"inline",
		);
		expect(() => runScenario(payload)).toThrow(/payload\.delta/);
	});

	it("falha quando esperava erro e não houve, e quando houve erro inesperado", () => {
		const semErro = parseScenario(base("  error: boom"), "inline");
		expect(() => runScenario(semErro)).toThrow(/esperava erro "boom"/);
		const inesperado = parseScenario(
			`
name: inesperado
kind: move_card
when:
  - run: [{ kind: kind_que_nao_existe }]
`,
			"inline",
		);
		expect(() => runScenario(inesperado)).toThrow(/erro inesperado/);
		const outroErro = parseScenario(
			`
name: outro
kind: move_card
when:
  - run: [{ kind: kind_que_nao_existe }]
then:
  error: outra mensagem
`,
			"inline",
		);
		expect(() => runScenario(outroErro)).toThrow(/não contém "outra mensagem"/);
	});

	it("confere zonas, dados restantes e escolha pendente", () => {
		const s = parseScenario(
			`
name: tudo
kind: noop
given:
  dice: [3]
  zones: [{ id: z }]
when:
  - run: [{ kind: noop }]
then:
  zones: { z: [x] }
  dice_left: 0
  pending: { id: nada }
`,
			"inline",
		);
		expect(() => runScenario(s)).toThrow(/zones\.z[\s\S]*dice_left[\s\S]*pending/);
	});

	it("rejeita cenário com formato inválido", () => {
		expect(() => parseScenario("name: x\nkind: noop\n", "inline")).toThrow(
			/inválido/,
		);
	});

	it("matchPartial compara objetos parcialmente e arrays por inteiro", () => {
		expect(matchPartial({ a: 1, b: 2 }, { a: 1 })).toEqual([]);
		expect(matchPartial([1, 2], [1])).toHaveLength(1);
		expect(matchPartial(3, { a: 1 })).toHaveLength(1);
		expect(matchPartial(null, null)).toEqual([]);
	});
});

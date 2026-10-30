import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	createKindRegistry,
	createKindRegistryFrom,
	defineCondition,
	defineKind,
	defineTypedKind,
	type KindNode,
	type RefResolver,
} from "./kinds";

const somar = defineKind<
	number,
	null,
	z.ZodObject<{ kind: z.ZodLiteral<"somar">; n: z.ZodNumber }>
>({
	kind: "somar",
	category: "effect",
	schema: z.object({ kind: z.literal("somar"), n: z.number() }),
	resolve: (state, node) => ({ state: state + node.n }),
	targets: (_state, node) => [`alvo-${node.n}`],
});

const repetir = defineKind<
	number,
	null,
	z.ZodObject<{ kind: z.ZodLiteral<"repetir">; vezes: z.ZodNumber }>
>({
	kind: "repetir",
	category: "effect",
	schema: z.object({ kind: z.literal("repetir"), vezes: z.number().int() }),
	resolve: (state, node) => ({
		state,
		push: Array.from({ length: node.vezes }, () => ({ kind: "somar", n: 1 })),
	}),
});

const perguntar = defineKind<
	number,
	null,
	z.ZodObject<{ kind: z.ZodLiteral<"perguntar"> }>
>({
	kind: "perguntar",
	category: "effect",
	schema: z.object({ kind: z.literal("perguntar") }),
	resolve: (state) => ({
		state: state + 100,
		pending: { id: "p", options: ["a", "b"] },
	}),
});

const laco = defineKind<
	number,
	null,
	z.ZodObject<{ kind: z.ZodLiteral<"laco"> }>
>({
	kind: "laco",
	category: "effect",
	schema: z.object({ kind: z.literal("laco") }),
	resolve: (state) => ({ state, push: [{ kind: "laco" }] }),
});

describe("registro de kinds", () => {
	const registry = createKindRegistry([somar, repetir, perguntar, laco]);

	it("parse valida o schema uma vez e devolve o nó", () => {
		expect(registry.parse({ kind: "somar", n: 4 } as never)).toEqual({
			kind: "somar",
			n: 4,
		});
		expect(() => registry.parse({ kind: "somar", n: "x" } as never)).toThrow(
			/Kind "somar" inválido/,
		);
		expect(() =>
			registry.parseAll([{ kind: "somar", n: 1 } as never, { kind: "somar" }]),
		).toThrow(/inválido/);
	});

	it("kind desconhecido falha listando os registrados", () => {
		expect(() => registry.run(0, { kind: "voar" }, null)).toThrow(
			'Kind desconhecido: "voar". Registrados: somar, repetir, perguntar, laco',
		);
	});

	it("rejeita kind duplicado", () => {
		expect(() => createKindRegistry([somar, somar])).toThrow(/duplicado/);
	});

	it("runAll aplica em ordem e expõe targets", () => {
		const nodes = [
			{ kind: "somar", n: 1 },
			{ kind: "somar", n: 2 },
		];
		const outcome = registry.runAll(0, nodes, null);
		expect(outcome).toEqual({ state: 3, stack: [] });
		expect(registry.kinds()).toEqual(["somar", "repetir", "perguntar", "laco"]);
		expect(registry.has("somar")).toBe(true);
		expect(registry.targets(0, nodes[1], null)).toEqual(["alvo-2"]);
		expect(registry.targets(0, { kind: "repetir" }, null)).toEqual([]);
	});

	it("push executa os nós empilhados antes do restante", () => {
		const outcome = registry.runAll(
			0,
			[
				{ kind: "repetir", vezes: 3 },
				{ kind: "somar", n: 10 },
			],
			null,
		);
		expect(outcome.state).toBe(13);
	});

	it("pending pausa e devolve o que falta para retomar", () => {
		const paused = registry.runAll(
			0,
			[{ kind: "perguntar" }, { kind: "somar", n: 1 }],
			null,
		);
		expect(paused.state).toBe(100);
		expect(paused.pending).toEqual({ id: "p", options: ["a", "b"] });
		expect(paused.stack).toEqual([{ kind: "somar", n: 1 }]);
		expect(registry.runAll(paused.state, paused.stack, null).state).toBe(101);
	});

	it("laço infinito de push é interrompido", () => {
		expect(() => registry.run(0, { kind: "laco" }, null)).toThrow(/excedeu/);
	});
});

describe("contrato estendido do registro", () => {
	const container = defineTypedKind<
		KindNode & { itens: readonly KindNode[] },
		number,
		null
	>({
		kind: "container",
		category: "effect",
		schema: z.object({
			kind: z.literal("container"),
			itens: z.array(z.looseObject({ kind: z.string() })),
		}),
		children: (node) => node.itens,
		resolve: (state, node) => ({ state, push: node.itens }),
	});
	const dobro = defineKind<
		number,
		null,
		z.ZodObject<{ kind: z.ZodLiteral<"dobro"> }>
	>({
		kind: "dobro",
		category: "effect",
		aliases: ["double", "x2"],
		vocabulary: { modo: ["a", "b"] },
		schema: z.object({ kind: z.literal("dobro") }),
		resolve: (state) => ({ state: state * 2 }),
	});
	const positivo = defineCondition<number, null, number>({
		kind: "positivo",
		schema: z.object({ kind: z.literal("positivo") }),
		test: (_node, ctx) => ctx > 0,
	});
	const refs: RefResolver<number>[] = [
		{
			id: "tarde",
			space: "n",
			priority: 5,
			resolve: (ref) => (ref === "$x" ? 2 : undefined),
		},
		{
			id: "cedo",
			space: "n",
			priority: -5,
			resolve: (ref) => (ref === "$x" ? 1 : undefined),
		},
		{ id: "outro", space: "s", resolve: (ref, ctx) => `${ref}:${ctx}` },
	];
	const registry = createKindRegistry<number, null, number>(
		[container, dobro, positivo] as never,
		{ refs },
	);

	it("aliases resolvem o mesmo kind, mas só o nome canônico é registrado", () => {
		expect(registry.has("dobro")).toBe(true);
		expect(registry.has("double")).toBe(false);
		expect(registry.canResolve("x2")).toBe(true);
		expect(registry.resolve(3, { kind: "double" }, null).state).toBe(6);
		expect(registry.run(3, { kind: "x2" }, null).state).toBe(6);
	});

	it("alias em conflito é recusado", () => {
		const outro = defineKind<
			number,
			null,
			z.ZodObject<{ kind: z.ZodLiteral<"outro"> }>
		>({
			kind: "outro",
			category: "effect",
			aliases: ["double"],
			schema: z.object({ kind: z.literal("outro") }),
			resolve: (state) => ({ state }),
		});
		expect(() => createKindRegistry([dobro, outro])).toThrow(/já pertence/);
	});

	it("vocabulário e categoria ficam consultáveis", () => {
		expect(registry.vocabularyOf("dobro")).toEqual({ modo: ["a", "b"] });
		expect(registry.vocabularyOf("container")).toEqual({});
		expect(registry.categoryOf("positivo")).toBe("condition");
		expect(registry.categoryOf("nada")).toBeUndefined();
	});

	it("validate percorre children recursivamente e informa o caminho", () => {
		const ok = {
			kind: "container",
			itens: [
				{ kind: "dobro" },
				{ kind: "container", itens: [{ kind: "dobro" }] },
			],
		};
		expect(() => registry.validate(ok, "carta x")).not.toThrow();
		expect(() =>
			registry.validate(
				{ kind: "container", itens: [{ kind: "dobro" }, { kind: "voar" }] },
				"carta x",
			),
		).toThrow(
			/carta x > container\[1\]: kind "voar" sem implementação registrada/,
		);
		expect(() =>
			registry.validate({ kind: "container", itens: "x" } as never, "carta x"),
		).toThrow(/carta x: kind "container" inválido/);
		expect(() => registry.validateAll([{ kind: "voar" }], "y")).toThrow(
			/y: kind "voar"/,
		);
		expect(() => registry.validate({} as never)).toThrow(/sem "kind"/);
	});

	it("evaluate e test exigem a fase correspondente", () => {
		expect(registry.canEvaluate("dobro")).toBe(false);
		expect(() => registry.evaluate({ kind: "dobro" }, 1)).toThrow(
			/não tem evaluate/,
		);
		expect(registry.test({ kind: "positivo" }, 3)).toBe(true);
		expect(registry.test({ kind: "positivo" }, -1)).toBe(false);
		expect(() => registry.test({ kind: "dobro" }, 1)).toThrow(
			/não é uma condição/,
		);
		expect(() => registry.resolve(0, { kind: "positivo" }, null)).toThrow(
			/não tem resolve/,
		);
	});

	it("evaluate despacha para o kind", () => {
		const avaliavel = defineKind<
			string,
			null,
			z.ZodObject<{ kind: z.ZodLiteral<"eco"> }>,
			string
		>({
			kind: "eco",
			category: "effect",
			schema: z.object({ kind: z.literal("eco") }),
			evaluate: (_node, ctx) => `eco:${ctx}`,
		});
		const r = createKindRegistry<string, null, string>([avaliavel]);
		expect(r.canEvaluate("eco")).toBe(true);
		expect(r.evaluate({ kind: "eco" }, "oi")).toBe("eco:oi");
	});

	it("refs: prioridade menor primeiro, por espaço, indefinido passa adiante", () => {
		expect(registry.ref<number>("n", "$x", 0)).toBe(1);
		expect(registry.ref<number>("n", "$y", 0)).toBeUndefined();
		expect(registry.ref<string>("s", "$z", 7)).toBe("$z:7");
		expect(() =>
			createKindRegistry([], { refs: [refs[0]!, refs[0]!] }),
		).toThrow(/RefResolver duplicado/);
	});

	it("pacotes se somam e kind repetido entre pacotes é recusado", () => {
		const a = { id: "a", kinds: [dobro] as never, refs: [refs[2]!] };
		const b = { id: "b", kinds: [container] as never };
		const juntos = createKindRegistryFrom<number, null, number>(a, b);
		expect(juntos.kinds()).toEqual(["dobro", "container"]);
		expect(juntos.ref<string>("s", "$q", 1)).toBe("$q:1");
		expect(() => createKindRegistryFrom<number, null, number>(a, a)).toThrow(
			/duplicado/,
		);
	});
});

describe("refsOf: referências estáticas validadas no carregamento", () => {
	const usaStat = defineKind<number, null, z.ZodObject<{ kind: z.ZodLiteral<"usa_stat">; stat: z.ZodString }>>({
		kind: "usa_stat",
		category: "effect",
		schema: z.object({ kind: z.literal("usa_stat"), stat: z.string() }),
		refsOf: (node) => [{ space: "stat", ref: node.stat }],
		resolve: (state) => ({ state }),
	});
	const refs: RefResolver<null>[] = [
		{ id: "t.stat", space: "stat", resolve: (ref) => (ref === "forca" ? 1 : undefined) },
	];

	it("aceita referência registrada e recusa a desconhecida", () => {
		const registry = createKindRegistry<number, null, null>([usaStat], { refs });
		expect(() => registry.validate({ kind: "usa_stat", stat: "forca" })).not.toThrow();
		expect(() => registry.validate({ kind: "usa_stat", stat: "magia" }, "carta x")).toThrow(
			/carta x: kind "usa_stat" usa stat "magia" sem resolvedor registrado/,
		);
	});
});

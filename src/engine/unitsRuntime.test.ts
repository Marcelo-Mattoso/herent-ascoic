import { describe, expect, it } from "vitest";
import {
	type AbilityDef,
	abilitiesOf,
	activeModifiers,
	addBlock,
	applyDamage,
	applyHeal,
	applyStatus,
	areaMembers,
	attributeOf,
	bindNodes,
	canAct,
	canUseAbility,
	checkUnitTargets,
	clampPools,
	closeUnitTurn,
	configureTurns,
	createEngine,
	createEngineState,
	createKindRegistryFrom,
	createScopeRegistry,
	createUnitCatalog,
	type DamageHook,
	despawnUnit,
	type EngineEventMap,
	endUnitTurn,
	engineBuiltinKinds,
	enterArea,
	equip,
	eventsOfType,
	expireScope,
	type GameState,
	isImmune,
	type KindNode,
	leaveArea,
	legalUnitTargets,
	nodesIn,
	openUnitTurn,
	poolMax,
	project,
	removeStatus,
	runReactive,
	scriptedDice,
	settle,
	spawnUnit,
	startUnitTurns,
	type StatusDef,
	statusesOf,
	testCondition,
	tickCooldowns,
	tickStatuses,
	type UnitCatalog,
	type UnitCtx,
	type UnitDef,
	type UnitRules,
	unequip,
	unitKinds,
	unitContentNodes,
	unitOf,
	unitResourceCost,
	unitView,
	unitsOf,
	useAbility,
	nextSeq,
} from "./index";

type S = GameState<null, EngineEventMap>;

const rules: UnitRules = {
	attributes: [
		{ id: "forca", kind: "stat" },
		{ id: "vida_max", kind: "stat", derived: [{ from: "forca", mul: 10 }] },
		{ id: "vida", kind: "pool", max: { attr: "vida_max" } },
		{ id: "mana_max", kind: "stat" },
		{ id: "mana", kind: "pool", max: { attr: "mana_max" } },
		{ id: "guarda", kind: "stat", min: 0, round: "floor" },
		{ id: "ritmo", kind: "stat", default: 1, max: 4 },
		{ id: "resiste_arcano", kind: "stat" },
	],
	lifePool: "vida",
	mitigation: [{ type: "fisico", attr: "guarda" }],
	resistance: [{ type: "arcano", attr: "resiste_arcano" }],
};

const mod = (
	attr: string,
	op: "add" | "mul" | "set" | "min" | "max",
	value: number,
) => ({ attr, op, value }) as const;

const abilities: AbilityDef[] = [
	{
		id: "golpe",
		activation: "active",
		action: "atacar",
		target: { who: "enemy" },
		effects: [
			{
				kind: "damage",
				target: "@target",
				amount: 10,
				type: "fisico",
				source: "@self",
			},
		],
	},
	{
		id: "bola",
		activation: "active",
		target: { who: "enemy" },
		cost: [{ pool: "mana", amount: 5 }],
		cooldown: { turns: 2, tickOn: "end" },
		effects: [{ kind: "damage", target: "@target", amount: 6, type: "arcano" }],
	},
	{
		id: "reforco",
		activation: "active",
		target: { who: "self" },
		effects: [{ kind: "heal", target: "@self", amount: 5, tags: ["x"] }],
	},
	{
		id: "pulso",
		activation: "active",
		target: { who: "any", min: 1, max: 2 },
		limit: { scope: "turn", times: 1 },
		effects: [{ kind: "damage", target: "@target", amount: 1, type: "puro" }],
	},
	{
		id: "so_se_ferido",
		activation: "active",
		condition: { kind: "attr_compare", attr: "vida", op: "lt", value: 10 },
		effects: [],
	},
	{
		id: "escolhe",
		activation: "active",
		effects: [
			{
				kind: "choose_one",
				options: [
					{ id: "a", do: [] },
					{ id: "b", do: [] },
				],
			},
		],
	},
	{
		id: "casca_arcana",
		activation: "static",
		effects: [],
		modifiers: [mod("resiste_arcano", "add", 50)],
	},
	{
		id: "sem_dot",
		activation: "static",
		effects: [],
		immunities: ["dot"],
	},
	{
		id: "passo",
		activation: "static",
		effects: [],
		modifiers: [mod("guarda", "add", 1)],
	},
	{
		id: "eco_tardio",
		activation: "triggered",
		on: { event: "dano.aplicado", scope: "unit" },
		priority: 5,
		effects: [{ kind: "heal", target: "@self", amount: 1 }],
	},
	{
		id: "eco_cedo",
		activation: "triggered",
		on: { event: "dano.aplicado", scope: "unit" },
		priority: 1,
		effects: [{ kind: "heal", target: "@self", amount: 2 }],
	},
	{
		id: "laco",
		activation: "triggered",
		on: { event: "cura.aplicada", scope: "unit" },
		effects: [{ kind: "heal", target: "@self", amount: 1 }],
	},
	{
		id: "pulso_do_dono",
		activation: "triggered",
		on: { event: "turno.iniciado", scope: "controller" },
		limit: { scope: "round", times: 1 },
		effects: [{ kind: "heal", target: "@self", amount: 1, tags: ["pulso"] }],
	},
];

const statuses: StatusDef[] = [
	{
		id: "dot",
		tags: ["dano_continuo"],
		duration: { kind: "permanent" },
		stack: "ignore",
	},
	{
		id: "escudo",
		tags: [],
		duration: { kind: "scope", scope: "turn" },
		stack: "refresh",
		modifiers: [mod("guarda", "add", 5)],
	},
	{
		id: "ferida",
		tags: [],
		duration: { kind: "turns", turns: 2, tickOn: "start", of: "any" },
		stack: "stack",
		maxStacks: 3,
		modifiers: [mod("guarda", "add", -1), mod("guarda", "mul", 0.5)],
		damageTaken: { fisico: 2 },
	},
	{
		id: "gelo",
		tags: [],
		duration: { kind: "turns", turns: 1, tickOn: "end", of: "holder" },
		stack: "refresh",
		blocks: ["mover"],
	},
	{
		id: "m_add",
		tags: [],
		duration: { kind: "permanent" },
		stack: "ignore",
		modifiers: [mod("guarda", "add", 3)],
	},
	{
		id: "m_set",
		tags: [],
		duration: { kind: "permanent" },
		stack: "ignore",
		modifiers: [mod("guarda", "set", 4)],
	},
	{
		id: "m_min",
		tags: [],
		duration: { kind: "permanent" },
		stack: "ignore",
		modifiers: [mod("guarda", "min", 6)],
	},
	{
		id: "m_max",
		tags: [],
		duration: { kind: "permanent" },
		stack: "ignore",
		modifiers: [mod("guarda", "max", 2)],
	},
	{
		id: "m_cond",
		tags: [],
		duration: { kind: "permanent" },
		stack: "ignore",
		modifiers: [
			{
				attr: "guarda",
				op: "add",
				value: 9,
				when: { kind: "has_status", status: "dot" },
			},
		],
	},
	{
		id: "fraco",
		tags: [],
		duration: { kind: "permanent" },
		stack: "replace",
		abilities: ["passo"],
	},
];

const units: UnitDef[] = [
	{
		id: "campeao",
		tags: ["vivo"],
		base: { forca: 5, mana_max: 10, guarda: 2 },
		abilities: [
			"golpe",
			"bola",
			"reforco",
			"pulso",
			"so_se_ferido",
			"escolhe",
			"pulso_do_dono",
		],
	},
	{
		id: "alvo",
		tags: ["vivo"],
		base: { forca: 3, guarda: 1 },
		abilities: ["eco_tardio", "eco_cedo", "casca_arcana", "sem_dot"],
	},
	{ id: "ecoante", tags: [], base: { forca: 2 }, abilities: ["laco"] },
	{
		id: "espada",
		tags: ["item"],
		base: {},
		abilities: [],
		slot: "mao",
		equipModifiers: [mod("forca", "add", 2)],
		equipAbilities: ["passo"],
	},
	{
		id: "pantano",
		tags: ["area"],
		base: {},
		abilities: [],
		aura: {
			filter: { kind: "has_status", status: "ferida", negate: true },
			modifiers: [mod("guarda", "add", -1)],
			onEnter: [{ kind: "apply_status", target: "@target", status: "dot" }],
			onLeave: [{ kind: "heal", target: "@target", amount: 1 }],
			onTurnStart: [
				{ kind: "damage", target: "@target", amount: 1, type: "puro" },
			],
		},
	},
];

const catalog: UnitCatalog = createUnitCatalog({
	rules,
	units,
	abilities,
	statuses,
});
const registry = createKindRegistryFrom<S, UnitCtx>(
	engineBuiltinKinds<null>(),
	unitKinds<null>(),
);
const scopes = createScopeRegistry();

function mesa(...spawns: { id: string; def: string; controller?: string }[]) {
	let engine = createEngineState<EngineEventMap>({
		dice: scriptedDice([]),
		players: ["p", "q"],
	});
	engine = configureTurns(engine, { order: ["p", "q"], phases: ["fase"] });
	for (const spawn of spawns) engine = spawnUnit(engine, catalog, spawn);
	return engine;
}

const duelo = () =>
	mesa(
		{ id: "c", def: "campeao", controller: "p" },
		{ id: "t", def: "alvo", controller: "q" },
	);
const state = (engine: ReturnType<typeof mesa>): S => ({ engine, game: null });
const valor = (e: ReturnType<typeof mesa>, unit: string, attr: string) =>
	attributeOf(e, catalog, unit, attr);
const tipos = (e: ReturnType<typeof mesa>, from = 0) =>
	e.events.filter((ev) => ev.seq >= from).map((ev) => ev.type);

describe("createUnitCatalog", () => {
	const make =
		(patch: Partial<Parameters<typeof createUnitCatalog>[0]>) => () =>
			createUnitCatalog({ rules, units, abilities, statuses, ...patch });

	it("indexa, congela e expõe as definições", () => {
		expect(catalog.unitDef("campeao").base.forca).toBe(5);
		expect(catalog.hasAttribute("vida")).toBe(true);
		expect(catalog.abilityDefs()).toHaveLength(abilities.length);
		expect(catalog.statusDefs()).toHaveLength(statuses.length);
		expect(catalog.unitDefs()).toHaveLength(units.length);
		expect(catalog.attributeDefs()).toHaveLength(rules.attributes.length);
		expect(Object.isFrozen(catalog.unitDef("campeao"))).toBe(true);
		expect(() => catalog.unitDef("x")).toThrow(/inexistente/);
	});

	it("recusa ids duplicados e vazios", () => {
		expect(make({ units: [units[0], units[0]] })).toThrow(/duplicado/);
		expect(make({ statuses: [{ ...statuses[0], id: "" }] })).toThrow(/sem id/);
	});

	it("recusa atributos inconsistentes", () => {
		const attr = (extra: object) => ({
			rules: {
				...rules,
				attributes: [
					...rules.attributes,
					{ id: "novo", kind: "stat", ...extra } as never,
				],
			},
		});
		expect(make(attr({ derived: [{ from: "nada" }] }))).toThrow(/desconhecido/);
		expect(make(attr({ derived: [{ from: "novo" }] }))).toThrow(/deriva de si/);
		expect(make(attr({ max: { attr: "nada" } }))).toThrow(/desconhecido/);
		expect(
			make({
				rules: {
					...rules,
					attributes: [
						{ id: "a", kind: "stat", derived: [{ from: "b" }] },
						{ id: "b", kind: "stat", derived: [{ from: "a" }] },
						{ id: "vida", kind: "pool" },
					],
				},
				units: [],
				abilities: [],
				statuses: [],
			}),
		).toThrow(/ciclo/);
		expect(make({ rules: { ...rules, lifePool: "forca" } })).toThrow(/recurso/);
		expect(
			make({ rules: { ...rules, mitigation: [{ type: "x", attr: "nada" }] } }),
		).toThrow(/mitigação/);
		const hook: DamageHook = { id: "h", priority: 0, apply: (p) => p };
		expect(make({ rules: { ...rules, damageHooks: [hook, hook] } })).toThrow(
			/hook duplicado/,
		);
	});

	it("recusa habilidades e status inconsistentes", () => {
		const ab = (patch: Partial<AbilityDef>) => ({
			abilities: [
				...abilities,
				{
					id: "novo",
					activation: "active",
					effects: [],
					...patch,
				} as AbilityDef,
			],
		});
		expect(make(ab({ activation: "triggered" }))).toThrow(/sem "on"/);
		expect(make(ab({ on: { event: "x" } }))).toThrow(/só gatilho/);
		expect(
			make(ab({ activation: "static", effects: [{ kind: "noop" }] })),
		).toThrow(/estática/);
		expect(make(ab({ modifiers: [mod("guarda", "add", 1)] }))).toThrow(
			/só estática/,
		);
		expect(make(ab({ cost: [{ pool: "forca", amount: 1 }] }))).toThrow(
			/recurso/,
		);
		expect(make(ab({ cost: [{ pool: "mana", amount: -1 }] }))).toThrow(/custo/);
		expect(make(ab({ cooldown: { turns: 0 } }))).toThrow(/recarga/);
		expect(make(ab({ limit: { scope: "turn", times: 0 } }))).toThrow(/limite/);
		expect(
			make(ab({ activation: "static", modifiers: [mod("nada", "add", 1)] })),
		).toThrow(/atributo desconhecido/);
		expect(
			make(
				ab({
					activation: "static",
					modifiers: [mod("guarda", "add", Number.NaN)],
				}),
			),
		).toThrow(/valor inválido/);
		expect(
			make(
				ab({
					effects: [{ kind: "apply_status", target: "@self", status: "nada" }],
				}),
			),
		).toThrow(/status desconhecido/);
		const st = (patch: Partial<StatusDef>) => ({
			statuses: [...statuses, { ...statuses[0], id: "novo", ...patch }],
		});
		expect(
			make(
				st({
					duration: { kind: "turns", turns: 0, tickOn: "end", of: "holder" },
				}),
			),
		).toThrow(/duração/);
		expect(make(st({ maxStacks: 0 }))).toThrow(/maxStacks/);
		expect(make(st({ abilities: ["nada"] }))).toThrow(
			/habilidade desconhecida/,
		);
		expect(
			make({ units: [{ ...units[0], id: "u", abilities: ["nada"] }] }),
		).toThrow(/habilidade desconhecida/);
		expect(
			make({ units: [{ ...units[0], id: "u", base: { nada: 1 } }] }),
		).toThrow(/atributo desconhecido/);
		expect(
			make({ rules: { ...rules, resistance: [{ type: "x", attr: "nada" }] } }),
		).toThrow(/atributo desconhecido/);
		expect(make(ab({ immunities: ["dot"] }))).toThrow(/só estática/);
	});

	it("lista os nós para validação e acha nós aninhados", () => {
		const origens = unitContentNodes(catalog).map((entry) => entry.origin);
		expect(origens).toContain("habilidade golpe");
		expect(origens).toContain("unidade pantano");
		expect(origens).toContain("status m_cond");
		expect(
			nodesIn({ a: [{ kind: "x", b: { kind: "y" } }], c: 1 }).map(
				(n) => n.kind,
			),
		).toEqual(["x", "y"]);
		expect(() =>
			registry.validateAll(
				unitContentNodes(catalog).flatMap((entry) => entry.nodes),
			),
		).not.toThrow();
	});

	it("bindNodes troca só os marcadores conhecidos, em qualquer profundidade", () => {
		const nodes: KindNode[] = [
			{
				kind: "x",
				a: "@self",
				b: ["@target", "@desconhecido", "texto"],
				c: { d: "@self" },
				n: 1,
			},
		];
		expect(bindNodes(nodes, { self: "u", target: "v" })).toEqual([
			{
				kind: "x",
				a: "u",
				b: ["v", "@desconhecido", "texto"],
				c: { d: "u" },
				n: 1,
			},
		]);
	});
});

describe("unidades, atributos e fontes vivas", () => {
	it("spawn calcula recursos cheios, deriva máximos e registra o evento", () => {
		const e = duelo();
		expect(valor(e, "c", "vida_max")).toBe(50);
		expect(valor(e, "c", "vida")).toBe(50);
		expect(valor(e, "c", "mana")).toBe(10);
		expect(valor(e, "t", "mana")).toBe(0);
		expect(valor(e, "c", "ritmo")).toBe(1);
		expect(eventsOfType(e.events, "unidade.criada")).toHaveLength(2);
		expect(unitsOf(e).map((u) => u.id)).toEqual(["c", "t"]);
		expect(() => spawnUnit(e, catalog, { id: "c", def: "campeao" })).toThrow(
			/duplicada/,
		);
		expect(() => unitOf(e, "nada")).toThrow(/desconhecida/);
		const custom = spawnUnit(mesa(), catalog, {
			id: "z",
			def: "campeao",
			tags: ["extra"],
			base: { forca: 1 },
			pools: { vida: 3 },
		});
		expect(unitOf(custom, "z").tags).toEqual(["vivo", "extra"]);
		expect(attributeOf(custom, catalog, "z", "vida")).toBe(3);
	});

	it("aplica add, mul, set, min e max nesta ordem, arredonda e faz clamp", () => {
		let e = duelo();
		const com = (id: string) => {
			e = applyStatus(e, catalog, "c", id);
			return valor(e, "c", "guarda");
		};
		expect(valor(e, "c", "guarda")).toBe(2);
		expect(com("m_add")).toBe(5);
		expect(com("ferida")).toBe(2);
		e = applyStatus(e, catalog, "c", "ferida");
		expect(valor(e, "c", "guarda")).toBe(0);
		expect(com("m_set")).toBe(4);
		expect(com("m_min")).toBe(6);
		expect(com("m_max")).toBe(2);
		expect(valor(e, "c", "ritmo")).toBe(1);
		const alto = spawnUnit(mesa(), catalog, {
			id: "r",
			def: "campeao",
			base: { ritmo: 9 },
		});
		expect(attributeOf(alto, catalog, "r", "ritmo")).toBe(4);
	});

	it("modificador condicional só vale enquanto a condição vale", () => {
		let e = applyStatus(duelo(), catalog, "c", "m_cond");
		expect(valor(e, "c", "guarda")).toBe(2);
		e = applyStatus(e, catalog, "c", "dot");
		expect(valor(e, "c", "guarda")).toBe(11);
		e = removeStatus(e, catalog, "c", { status: "dot" });
		expect(valor(e, "c", "guarda")).toBe(2);
	});

	it("deriva modificadores e habilidades de unidade, status, item e área, sem guardá-los", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "esp", def: "espada" },
			{ id: "ar", def: "pantano" },
		);
		e = equip(e, catalog, "esp", "c");
		e = enterArea(e, catalog, "c", "ar");
		e = applyStatus(e, catalog, "c", "fraco");
		const fontes = activeModifiers(e, catalog, "c").map(
			(m) => `${m.source.kind}:${m.source.id}`,
		);
		expect(fontes.sort()).toEqual([
			"area:ar",
			"item:esp",
			"item:esp",
			"status:fraco",
		]);
		expect(
			abilitiesOf(e, catalog, "c")
				.filter((r) => r.def.id === "passo")
				.map((r) => r.source.kind)
				.sort(),
		).toEqual(["item", "status"]);
		expect(JSON.stringify(e)).not.toContain('"modifiers"');
		expect(valor(e, "c", "forca")).toBe(7);
		expect(valor(e, "c", "guarda")).toBe(2 + 1 + 1 - 1);
	});

	it("filtro da aura exclui quem não passa", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "ar", def: "pantano" },
		);
		e = enterArea(e, catalog, "c", "ar");
		expect(valor(e, "c", "guarda")).toBe(1);
		e = applyStatus(e, catalog, "c", "ferida");
		expect(valor(e, "c", "guarda")).toBe(Math.floor((2 - 1) * 0.5));
	});

	it("máximo que sobe não cura e máximo que cai corta", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "esp", def: "espada" },
		);
		e = equip(e, catalog, "esp", "c");
		expect(valor(e, "c", "vida_max")).toBe(70);
		expect(valor(e, "c", "vida")).toBe(50);
		e = applyHeal(e, catalog, { target: "c", amount: 20 });
		expect(valor(e, "c", "vida")).toBe(70);
		e = unequip(e, catalog, "esp");
		expect(valor(e, "c", "vida")).toBe(50);
		expect(poolMax(e, catalog, "c", "vida")).toBe(50);
		expect(() => poolMax(e, catalog, "c", "forca")).toThrow(/não é um recurso/);
		expect(clampPools(e, catalog, "c")).toBe(e);
	});

	it("protege contra dependência circular entre condições e atributos", () => {
		const ciclo = createUnitCatalog({
			rules: {
				attributes: [
					{ id: "vida", kind: "pool" },
					{ id: "a", kind: "stat" },
				],
				lifePool: "vida",
			},
			units: [
				{
					id: "u",
					tags: [],
					base: {},
					abilities: ["auto"],
				},
			],
			abilities: [
				{
					id: "auto",
					activation: "static",
					effects: [],
					modifiers: [
						{
							attr: "a",
							op: "add",
							value: 1,
							when: { kind: "attr_compare", attr: "a", op: "gte", value: 0 },
						},
					],
				},
			],
		});
		const e = spawnUnit(
			createEngineState<EngineEventMap>({ dice: scriptedDice([]) }),
			ciclo,
			{ id: "u", def: "u" },
		);
		expect(() => attributeOf(e, ciclo, "u", "a")).toThrow(/profundidade/);
	});

	it("equip, unequip, despawn e áreas validam e limpam referências", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "t", def: "alvo", controller: "q" },
			{ id: "esp", def: "espada" },
			{ id: "esp2", def: "espada" },
			{ id: "ar", def: "pantano" },
		);
		e = equip(e, catalog, "esp", "c");
		expect(() => equip(e, catalog, "esp", "t")).toThrow(/já está equipado/);
		expect(() => equip(e, catalog, "esp2", "c")).toThrow(/ocupado/);
		expect(() => unequip(e, catalog, "esp2")).toThrow(/não está equipado/);
		expect(unitOf(e, "esp").slot).toBe("mao");
		expect(() => enterArea(e, catalog, "c", "t")).toThrow(/não é uma área/);
		expect(() => enterArea(e, catalog, "ar", "ar")).toThrow(/em si mesma/);
		e = enterArea(e, catalog, "c", "ar");
		expect(enterArea(e, catalog, "c", "ar")).toBe(e);
		expect(leaveArea(e, catalog, "t", "ar")).toBe(e);
		e = enterArea(e, catalog, "t", "ar");
		expect(areaMembers(e, "ar")).toEqual(["c", "t"]);
		const semItem = despawnUnit(e, catalog, "c");
		expect(unitOf(semItem, "esp").equippedTo).toBeUndefined();
		expect(areaMembers(semItem, "ar")).toEqual(["t"]);
		const semArea = despawnUnit(e, catalog, "ar");
		expect(unitOf(semArea, "c").presentIn).toEqual([]);
		expect(
			eventsOfType(semArea.events, "area.saiu").at(-1)?.payload.reason,
		).toBe("removida");
		const semAlvo = despawnUnit(
			equip(e, catalog, "esp2", "t", "outro"),
			catalog,
			"esp2",
		);
		expect(semAlvo.units?.esp2).toBeUndefined();
		expect(tipos(semAlvo).at(-1)).toBe("unidade.removida");
	});
});

describe("status", () => {
	it("imunidade, política de empilhamento e remoção", () => {
		let e = duelo();
		expect(isImmune(e, catalog, "t", "dot")).toBe("dot");
		expect(isImmune(e, catalog, "c", "dot")).toBeUndefined();
		const antes = nextSeq(e.events);
		e = applyStatus(e, catalog, "t", "dot");
		expect(tipos(e, antes)).toEqual(["status.imune"]);
		e = applyStatus(e, catalog, "c", "ferida", "t");
		e = applyStatus(e, catalog, "c", "ferida");
		e = applyStatus(e, catalog, "c", "ferida");
		e = applyStatus(e, catalog, "c", "ferida");
		expect(statusesOf(e, "c")[0]).toMatchObject({
			stacks: 3,
			remaining: 2,
			source: "t",
		});
		e = applyStatus(e, catalog, "c", "fraco");
		e = applyStatus(e, catalog, "c", "fraco");
		expect(
			eventsOfType(e.events, "status.removido").at(-1)?.payload.reason,
		).toBe("substituido");
		expect(removeStatus(e, catalog, "c", { tag: "nada" })).toBe(e);
		e = removeStatus(e, catalog, "c", { status: "ferida" });
		expect(statusesOf(e, "c").map((s) => s.status)).toEqual(["fraco"]);
	});

	it("canAct considera status e bloqueios com duração", () => {
		let e = applyStatus(duelo(), catalog, "c", "gelo");
		expect(canAct(e, catalog, "c", "mover")).toEqual({ ok: false, by: "gelo" });
		expect(canAct(e, catalog, "c", "atacar")).toEqual({ ok: true });
		e = addBlock(e, "c", "atacar", 1);
		e = addBlock(e, "c", "atacar", 2);
		expect(canAct(e, catalog, "c", "atacar")).toEqual({
			ok: false,
			by: "bloqueio",
		});
		expect(unitOf(e, "c").blocks).toEqual([{ action: "atacar", remaining: 2 }]);
		e = tickStatuses(e, catalog, "q", "end");
		expect(unitOf(e, "c").blocks).toHaveLength(1);
		e = tickStatuses(e, catalog, "p", "end");
		e = tickStatuses(e, catalog, "p", "end");
		expect(unitOf(e, "c").blocks).toEqual([]);
		expect(statusesOf(e, "c")).toEqual([]);
	});

	it("tick de 'any' ocorre em qualquer turno; de 'holder' só no do controlador", () => {
		let e = applyStatus(
			applyStatus(duelo(), catalog, "c", "ferida"),
			catalog,
			"c",
			"gelo",
		);
		e = tickStatuses(e, catalog, "q", "start");
		expect(
			statusesOf(e, "c").find((s) => s.status === "ferida")?.remaining,
		).toBe(1);
		e = tickStatuses(e, catalog, "q", "end");
		expect(statusesOf(e, "c").find((s) => s.status === "gelo")?.remaining).toBe(
			1,
		);
		e = tickStatuses(e, catalog, "p", "end");
		expect(statusesOf(e, "c").map((s) => s.status)).toEqual(["ferida"]);
		e = tickStatuses(e, catalog, "p", "start");
		expect(statusesOf(e, "c")).toEqual([]);
	});

	it("duração por escopo some quando o escopo, ou um ancestral, termina", () => {
		let e = applyStatus(duelo(), catalog, "c", "escudo");
		expect(valor(e, "c", "guarda")).toBe(7);
		expect(expireScope(e, catalog, scopes, "phase")).toBe(e);
		e = expireScope(e, catalog, scopes, "round");
		expect(statusesOf(e, "c")).toEqual([]);
		expect(
			eventsOfType(e.events, "status.removido").at(-1)?.payload.reason,
		).toBe("escopo");
		const sem = createScopeRegistry([{ id: "outro" }]);
		const preso = applyStatus(duelo(), catalog, "c", "escudo");
		expect(expireScope(preso, catalog, sem, "outro")).toBe(preso);
	});

	it("o fim do turno expira escudos de escopo 'turn' no motor de turnos", () => {
		let s = startUnitTurns(
			registry,
			state(applyStatus(duelo(), catalog, "c", "escudo")),
			catalog,
		);
		s = endUnitTurn(registry, s, catalog, scopes);
		expect(statusesOf(s.engine, "c")).toEqual([]);
	});

	it("recargas contam no início ou no fim do turno conforme declarado", () => {
		let e = duelo();
		e = {
			...e,
			units: {
				...e.units,
				c: { ...unitOf(e, "c"), cooldowns: { bola: 2, golpe: 1 } },
			},
		};
		e = tickCooldowns(e, catalog, "q", "end");
		expect(unitOf(e, "c").cooldowns).toEqual({ bola: 2, golpe: 1 });
		e = tickCooldowns(e, catalog, "p", "start");
		expect(unitOf(e, "c").cooldowns).toEqual({ bola: 2 });
		e = tickCooldowns(e, catalog, "p", "end");
		expect(unitOf(e, "c").cooldowns).toEqual({ bola: 1 });
	});
});

describe("pipeline de dano e cura", () => {
	it("resistência, vulnerabilidade, mitigação e piso zero", () => {
		let e = duelo();
		e = applyDamage(e, catalog, { target: "t", amount: 10, type: "arcano" });
		expect(valor(e, "t", "vida")).toBe(25);
		e = applyDamage(e, catalog, { target: "t", amount: 3, type: "fisico" });
		expect(valor(e, "t", "vida")).toBe(23);
		e = applyStatus(e, catalog, "t", "ferida");
		e = applyDamage(e, catalog, {
			target: "t",
			amount: 5,
			type: "fisico",
			source: "c",
		});
		expect(
			eventsOfType(e.events, "dano.aplicado").at(-1)?.payload,
		).toMatchObject({
			proposed: 5,
			amount: 10,
			source: "c",
		});
	});

	it("hooks cedo e tarde rodam antes e depois da mitigação, em ordem de prioridade", () => {
		const log: string[] = [];
		const cedo: DamageHook = {
			id: "cedo",
			priority: 0,
			apply: (p) => {
				log.push(`cedo:${p.amount}`);
				return { ...p, amount: p.amount + 4 };
			},
		};
		const meio: DamageHook = {
			id: "meio",
			priority: 50,
			apply: (p) => {
				log.push(`meio:${p.amount}`);
				return p;
			},
		};
		const tarde: DamageHook = {
			id: "tarde",
			priority: 100,
			apply: (p) => {
				log.push(`tarde:${p.amount}`);
				return { ...p, amount: p.amount - 100 };
			},
		};
		const cat = createUnitCatalog({
			rules: { ...rules, damageHooks: [tarde, meio, cedo] },
			units,
			abilities,
			statuses,
		});
		let e = spawnUnit(
			createEngineState<EngineEventMap>({ dice: scriptedDice([]) }),
			cat,
			{ id: "t", def: "alvo" },
		);
		e = applyDamage(e, cat, { target: "t", amount: 10, type: "fisico" });
		expect(log).toEqual(["cedo:10", "meio:14", "tarde:13"]);
		expect(attributeOf(e, cat, "t", "vida")).toBe(30);
	});

	it("derrota emite uma vez e cura respeita hooks e o máximo", () => {
		const bonus = {
			id: "dobro",
			priority: 0,
			apply: (p: { amount: number }) => ({ ...p, amount: p.amount * 2 }),
		};
		const cat = createUnitCatalog({
			rules: { ...rules, healHooks: [bonus as never] },
			units,
			abilities,
			statuses,
		});
		let e = spawnUnit(
			createEngineState<EngineEventMap>({ dice: scriptedDice([]) }),
			cat,
			{ id: "t", def: "alvo" },
		);
		e = applyDamage(e, cat, {
			target: "t",
			amount: 40,
			type: "puro",
			source: "x",
		});
		e = applyDamage(e, cat, { target: "t", amount: 1, type: "puro" });
		expect(eventsOfType(e.events, "unidade.derrotada")).toHaveLength(1);
		e = applyHeal(e, cat, { target: "t", amount: 4 });
		expect(attributeOf(e, cat, "t", "vida")).toBe(8);
		e = applyHeal(e, cat, { target: "t", amount: 100, source: "x" });
		expect(
			eventsOfType(e.events, "cura.aplicada").at(-1)?.payload,
		).toMatchObject({
			requested: 200,
			amount: 22,
		});
	});

	it("unitResourceCost cobra do recurso da unidade e valida", () => {
		const e = duelo();
		const custo = unitResourceCost("mana", 4);
		expect(custo.canPay(e, "c")).toEqual({ ok: true });
		expect(custo.canPay(e, "t").ok).toBe(false);
		expect(valor(custo.pay(e, "c"), "c", "mana")).toBe(6);
		expect(() => unitResourceCost("mana", 1.5)).toThrow(/inválido/);
	});
});

describe("habilidades", () => {
	it("explica cada recusa", () => {
		const e = duelo();
		const por = (unit: string, id: string, alvos: string[] = ["t"]) => {
			const r = canUseAbility(e, catalog, unit, id, alvos);
			return r.ok ? "ok" : r.reason;
		};
		expect(por("c", "nada")).toBe("indisponivel");
		expect(por("c", "passo")).toBe("indisponivel");
		expect(por("c", "golpe")).toBe("ok");
		expect(por("c", "golpe", [])).toBe("alvo");
		expect(por("c", "golpe", ["c"])).toBe("alvo");
		expect(por("c", "golpe", ["t", "t"])).toBe("alvo");
		expect(por("c", "so_se_ferido")).toBe("condicao");
		expect(por("c", "reforco", [])).toBe("ok");
		const seco = applyDamage(duelo(), catalog, {
			target: "c",
			amount: 45,
			type: "puro",
		});
		expect(canUseAbility(seco, catalog, "c", "so_se_ferido").ok).toBe(true);
		const gelado = applyStatus(
			applyDamage(e, catalog, { target: "t", amount: 1, type: "puro" }),
			catalog,
			"c",
			"gelo",
		);
		expect(canUseAbility(gelado, catalog, "c", "golpe", ["t"]).ok).toBe(true);
	});

	it("paga custo, grava recarga, emite o evento e resolve os efeitos", () => {
		const r = useAbility(registry, state(duelo()), catalog, "c", "bola", ["t"]);
		expect(r.ok).toBe(true);
		const e = r.state.engine;
		expect(valor(e, "c", "mana")).toBe(5);
		expect(unitOf(e, "c").cooldowns).toEqual({ bola: 2 });
		expect(eventsOfType(e.events, "dano.aplicado")[0].payload.amount).toBe(3);
		expect(valor(e, "t", "vida")).toBe(30);
		expect(tipos(e)).toContain("habilidade.usada");
		const de = useAbility(registry, r.state, catalog, "c", "bola", ["t"]);
		expect(de.ok).toBe(false);
		expect(!de.ok && de.reason).toBe("cooldown");
		expect(de.state).toBe(r.state);
	});

	it("bloqueio registra acao.bloqueada e não paga nada", () => {
		const travado = state(addBlock(duelo(), "c", "atacar", 1));
		const r = useAbility(registry, travado, catalog, "c", "golpe", ["t"]);
		expect(r.ok).toBe(false);
		expect(
			eventsOfType(r.state.engine.events, "acao.bloqueada")[0].payload,
		).toEqual({
			unit: "c",
			action: "atacar",
			by: "bloqueio",
		});
		expect(valor(r.state.engine, "t", "vida")).toBe(30);
	});

	it("limite por escopo conta usos e zera quando o escopo termina", () => {
		let s = startUnitTurns(registry, state(duelo()), catalog);
		const usar = () =>
			useAbility(registry, s, catalog, "c", "pulso", ["t", "c"]);
		const um = usar();
		expect(um.ok).toBe(true);
		s = um.state;
		expect(valor(s.engine, "c", "vida")).toBe(49);
		const dois = usar();
		expect(!dois.ok && dois.reason).toBe("limite");
		s = endUnitTurn(
			registry,
			endUnitTurn(registry, s, catalog, scopes),
			catalog,
			scopes,
		);
		expect(usar().ok).toBe(true);
	});

	it("efeito que abre escolha devolve o estado pendente sem reagir", () => {
		const r = useAbility(registry, state(duelo()), catalog, "c", "escolhe");
		expect(r.ok).toBe(true);
		expect(r.state.engine.pending?.choice.id).toBe("choose_one");
	});
});

describe("reator", () => {
	it("gatilhos do mesmo evento resolvem por (prioridade, unidade, habilidade)", () => {
		const s = runReactive(
			registry,
			state(
				applyDamage(duelo(), catalog, {
					target: "t",
					amount: 20,
					type: "puro",
				}),
			),
			catalog,
			[{ kind: "damage", target: "t", amount: 1, type: "puro" }],
		);
		const curas = eventsOfType(s.engine.events, "cura.aplicada").map(
			(ev) => ev.payload.requested,
		);
		expect(curas).toEqual([2, 1]);
		expect(s.engine.stack).toEqual({ pending: [], resolving: null });
	});

	it("corta reações encadeadas acima do limite", () => {
		const base = mesa({ id: "z", def: "ecoante", controller: "p" });
		const s = state(
			applyDamage(base, catalog, { target: "z", amount: 5, type: "puro" }),
		);
		expect(() =>
			runReactive(registry, s, catalog, [
				{ kind: "heal", target: "z", amount: 1 },
			]),
		).toThrow(/limite de 32/);
		const curto = createUnitCatalog({
			rules: { ...rules, maxReactions: 3 },
			units,
			abilities,
			statuses,
		});
		expect(() =>
			runReactive(registry, s, curto, [
				{ kind: "heal", target: "z", amount: 1 },
			]),
		).toThrow(/limite de 3/);
	});

	it("aura: onEnter, onLeave e onTurnStart rodam com o alvo ligado", () => {
		let s = startUnitTurns(
			registry,
			state(
				mesa(
					{ id: "c", def: "campeao", controller: "p" },
					{ id: "ar", def: "pantano" },
				),
			),
			catalog,
		);
		s = runReactive(registry, s, catalog, [
			{ kind: "move_to_area", target: "c", area: "ar" },
		]);
		expect(statusesOf(s.engine, "c").map((x) => x.status)).toEqual(["dot"]);
		s = endUnitTurn(
			registry,
			endUnitTurn(registry, s, catalog, scopes),
			catalog,
			scopes,
		);
		expect(valor(s.engine, "c", "vida")).toBe(49);
		const sai = leaveArea(s.engine, catalog, "c", "ar");
		const depois = settle(
			registry,
			{ ...s, engine: sai },
			catalog,
			nextSeq(s.engine.events),
		);
		expect(valor(depois.engine, "c", "vida")).toBe(50);
	});

	it("onLeave de área removida e filtro de aura não disparam", () => {
		let s = state(
			mesa(
				{ id: "c", def: "campeao", controller: "p" },
				{ id: "ar", def: "pantano" },
			),
		);
		s = runReactive(registry, s, catalog, [
			{ kind: "apply_status", target: "c", status: "ferida" },
			{ kind: "move_to_area", target: "c", area: "ar" },
		]);
		expect(statusesOf(s.engine, "c").map((x) => x.status)).toEqual(["ferida"]);
		const seco = despawnUnit(s.engine, catalog, "ar");
		const settled = settle(
			registry,
			{ ...s, engine: seco },
			catalog,
			nextSeq(s.engine.events),
		);
		expect(eventsOfType(settled.engine.events, "cura.aplicada")).toHaveLength(
			0,
		);
	});

	it("turnos: gatilho do controlador, limite por rodada e ordem fechar/abrir", () => {
		let s = startUnitTurns(
			registry,
			state(mesa({ id: "c", def: "campeao", controller: "p" })),
			catalog,
		);
		s = runReactive(registry, s, catalog, [
			{ kind: "damage", target: "c", amount: 10, type: "puro" },
		]);
		const fechado = closeUnitTurn(s, catalog, scopes);
		expect(valor(fechado.state.engine, "c", "vida")).toBe(40);
		const aberto = openUnitTurn(registry, fechado, catalog);
		expect(valor(aberto.engine, "c", "vida")).toBe(40);
		const volta = endUnitTurn(registry, aberto, catalog, scopes);
		expect(valor(volta.engine, "c", "vida")).toBe(41);
		expect(
			eventsOfType(volta.engine.events, "cura.aplicada").map(
				(ev) => ev.payload.tags,
			),
		).toEqual([["pulso"], ["pulso"]]);
	});
});

describe("kinds de unidade", () => {
	const run = (nodes: KindNode[], e = duelo()) =>
		runReactive(registry, state(e), catalog, nodes);

	it("damage, heal, apply_status e remove_status", () => {
		const s = run([
			{ kind: "damage", target: "c", amount: 7, type: "puro" },
			{ kind: "heal", target: "c", amount: 2, tags: ["a"], pool: "vida" },
			{ kind: "apply_status", target: "c", status: "dot", source: "t" },
			{ kind: "remove_status", target: "c", tag: "dano_continuo" },
		]);
		expect(valor(s.engine, "c", "vida")).toBe(45);
		expect(statusesOf(s.engine, "c")).toEqual([]);
	});

	it("modify_attribute em recurso respeita limites e recusa modos trocados", () => {
		const s = run([
			{
				kind: "modify_attribute",
				target: "c",
				attr: "mana",
				delta: -99,
				mode: "atual",
			},
			{
				kind: "modify_attribute",
				target: "c",
				attr: "mana",
				delta: 99,
				mode: "atual",
			},
		]);
		expect(valor(s.engine, "c", "mana")).toBe(10);
		expect(() =>
			run([
				{
					kind: "modify_attribute",
					target: "c",
					attr: "forca",
					delta: 1,
					mode: "atual",
				},
			]),
		).toThrow(/não é um recurso/);
	});

	it("block_action e move_to_area (sem área é erro)", () => {
		const s = run([
			{ kind: "block_action", target: "c", action: "mover", turns: 1 },
		]);
		expect(canAct(s.engine, catalog, "c", "mover").ok).toBe(false);
		expect(() =>
			run([{ kind: "move_to_area", target: "c", area: "nenhuma" }]),
		).toThrow(/desconhecida/);
	});

	it("schemas recusam payload inválido", () => {
		for (const node of [
			{ kind: "damage", target: "c", amount: -1, type: "x" },
			{ kind: "heal", target: "", amount: 1 },
			{ kind: "apply_status", target: "c" },
			{ kind: "remove_status", target: "c" },
			{
				kind: "modify_attribute",
				target: "c",
				attr: "x",
				delta: 1,
				mode: "outro",
			},
			{ kind: "block_action", target: "c", action: "x", turns: 0 },
			{ kind: "move_to_area", target: "c" },
			{ kind: "in_area" },
			{ kind: "has_status", status: "a", tag: "b" },
			{ kind: "attr_compare", attr: "x", op: "xx", value: 1 },
		]) {
			expect(
				() => registry.validate(node as KindNode),
				JSON.stringify(node),
			).toThrow(/inválido/);
		}
	});

	it("condições exigem contexto e aceitam regras próprias do jogo", () => {
		expect(() =>
			registry.test({ kind: "in_area", area: "a" }, { units: catalog }),
		).toThrow(/exige estado/);
		const e = duelo();
		expect(() => testCondition(e, catalog, "c", { kind: "inventada" })).toThrow(
			/desconhecida/,
		);
		const cat = createUnitCatalog({
			rules: {
				...rules,
				conditions: { inventada: (_n, ctx) => ctx.subject === "c" },
			},
			units,
			abilities,
			statuses,
		});
		expect(testCondition(e, cat, "c", { kind: "inventada" })).toBe(true);
		expect(
			testCondition(e, cat, "t", { kind: "inventada", negate: true }),
		).toBe(true);
	});
});

describe("alvos de unidade", () => {
	it("filtra por lado, tags e área", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "c2", def: "campeao", controller: "p" },
			{ id: "t", def: "alvo", controller: "q" },
			{ id: "esp", def: "espada" },
			{ id: "ar", def: "pantano" },
		);
		e = enterArea(e, catalog, "t", "ar");
		expect(legalUnitTargets(e, { who: "enemy" }, "c")).toEqual(["t"]);
		expect(legalUnitTargets(e, { who: "ally" }, "c")).toEqual(["c", "c2"]);
		expect(legalUnitTargets(e, { who: "any" }, "c")).toEqual(["c", "c2", "t"]);
		expect(
			legalUnitTargets(e, { who: "any", tags: ["vivo", "x"] }, "c"),
		).toEqual([]);
		expect(legalUnitTargets(e, { who: "any", inArea: "ar" }, "c")).toEqual([
			"t",
		]);
		expect(legalUnitTargets(e, { who: "any", inArea: "pantano" }, "c")).toEqual(
			["t"],
		);
		expect(legalUnitTargets(e, { who: "self" }, "c")).toEqual(["c"]);
		expect(checkUnitTargets(e, { who: "self" }, "c", ["c"])).toEqual({
			ok: true,
		});
		expect(
			checkUnitTargets(e, { who: "enemy", min: 1, max: 2 }, "c", ["t"]),
		).toEqual({ ok: true });
		expect(checkUnitTargets(e, { who: "enemy" }, "c", [])).toMatchObject({
			ok: false,
		});
	});
});

describe("projeção de unidades e montagem", () => {
	it("unitView entrega atributos finais, status, recargas e presença", () => {
		let e = mesa(
			{ id: "c", def: "campeao", controller: "p" },
			{ id: "ar", def: "pantano" },
		);
		e = enterArea(applyStatus(e, catalog, "c", "gelo"), catalog, "c", "ar");
		const view = unitView(e, catalog, "c");
		expect(view).toMatchObject({
			id: "c",
			controller: "p",
			attributes: { vida: 50, guarda: 1 },
			statuses: [{ status: "gelo", stacks: 1, remaining: 1 }],
			presentIn: ["ar"],
		});
		const anon = unitView(e, catalog, "ar");
		expect(anon.controller).toBeUndefined();
	});

	it("project inclui unidades só quando há catálogo e respeita a visibilidade", () => {
		const e = duelo();
		expect(project(e, "p").units).toBeUndefined();
		expect(
			Object.keys(project(e, "p", { units: catalog }).units ?? {}),
		).toEqual(["c", "t"]);
		const oculto = project(e, "q", {
			units: catalog,
			unitVisible: (unit, viewer) => unit.controller === viewer,
		});
		expect(Object.keys(oculto.units ?? {})).toEqual(["t"]);
	});

	it("createEngine valida, congela e expõe o catálogo de unidades", () => {
		const content = {
			card: () => ({}),
			hasCard: () => false,
			cards: () => [],
			abilitiesOf: () => [],
			ability: () => ({}),
			hasAbility: () => false,
			text: (key: string) => key,
			unitDefs: () => units,
			abilityDefs: () => abilities,
			statusDefs: () => statuses,
		};
		const base = {
			ruleset: {
				id: "r",
				version: "1",
				balance: {},
				transitions: {},
				eventRules: {},
			},
			content,
			kinds: registry as never,
			dice: () => scriptedDice([]),
			requirements: { met: () => true },
			scopes: { registry: scopes, key: () => "k" },
		};
		const motor = createEngine({ ...base, units: rules } as never) as {
			units: UnitCatalog;
		};
		expect(motor.units.unitDef("campeao").id).toBe("campeao");
		expect(Object.isFrozen(motor.units)).toBe(true);
		expect(() => createEngine(base as never)).toThrow(/sem regras de unidades/);
		const ruim = {
			...content,
			abilityDefs: () => [
				{ id: "x", activation: "active", effects: [{ kind: "inventado" }] },
			],
			unitDefs: () => [],
			statusDefs: () => [],
		};
		expect(() =>
			createEngine({ ...base, content: ruim, units: rules } as never),
		).toThrow(/kind "inventado"/);
		const incoerente = {
			...content,
			unitDefs: () => [{ ...units[0], abilities: ["nada"] }],
		};
		expect(() =>
			createEngine({ ...base, content: incoerente, units: rules } as never),
		).toThrow(/unidades inválidas/);
	});
});

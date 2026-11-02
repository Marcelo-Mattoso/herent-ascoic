import {
	type AbilityDef,
	type AttributeDef,
	createKindRegistryFrom,
	createUnitCatalog,
	type EngineEventMap,
	engineBuiltinKinds,
	type GameState,
	type KindRegistry,
	type StatusDef,
	type UnitCatalog,
	type UnitCtx,
	type UnitDef,
	type UnitRules,
	unitKinds,
} from "../../../src/engine";

export interface RpgGame {
	readonly resultado?: "vitoria" | "derrota";
}

export type Rpg = GameState<RpgGame, EngineEventMap>;
export type KindsRpg = KindRegistry<Rpg, UnitCtx, never>;

export const JOGADOR_A = "a";
export const JOGADOR_E = "e";
export const ARIA = "aria";
export const ESPREITADOR = "espreitador";
export const COTA = "cota";
export const LAGO = "lago";

const atributos: readonly AttributeDef[] = [
	{ id: "constituicao", kind: "stat" },
	{
		id: "vida_max",
		kind: "stat",
		derived: [{ from: "constituicao", mul: 10 }],
	},
	{ id: "vida", kind: "pool", max: { attr: "vida_max" } },
	{ id: "mana_max", kind: "stat" },
	{ id: "mana", kind: "pool", max: { attr: "mana_max" } },
	{ id: "armadura", kind: "stat", min: 0 },
];

export const regras: UnitRules = {
	attributes: atributos,
	lifePool: "vida",
	mitigation: [{ type: "fisico", attr: "armadura" }],
};

const naoNoLago = { kind: "in_area", area: LAGO, negate: true };
const quandoTurnoDoControlador = {
	event: "turno.iniciado",
	scope: "controller",
} as const;

export const habilidades: readonly AbilityDef[] = [
	{
		id: "golpe_lamina",
		activation: "active",
		action: "atacar",
		target: { who: "enemy" },
		effects: [
			{ kind: "damage", target: "@target", amount: 8, type: "fisico", source: "@self" },
		],
	},
	{
		id: "lampejo",
		activation: "active",
		action: "usar_habilidade",
		target: { who: "enemy" },
		cost: [{ pool: "mana", amount: 8 }],
		cooldown: { turns: 2 },
		effects: [
			{ kind: "damage", target: "@target", amount: 12, type: "arcano", source: "@self" },
		],
	},
	{
		id: "vigor_sereno",
		activation: "triggered",
		on: quandoTurnoDoControlador,
		condition: naoNoLago,
		effects: [
			{ kind: "heal", target: "@self", amount: 4, tags: ["regeneracao"] },
		],
	},
	{
		id: "mover_lago",
		activation: "active",
		action: "mover",
		condition: naoNoLago,
		effects: [{ kind: "move_to_area", target: "@self", area: LAGO }],
	},
	{
		id: "pocao_comum",
		activation: "active",
		action: "usar_item",
		effects: [{ kind: "heal", target: "@self", amount: 15, tags: ["pocao"] }],
	},
	{
		id: "antidoto",
		activation: "active",
		action: "usar_item",
		effects: [
			{ kind: "heal", target: "@self", amount: 10, tags: ["antidoto"] },
			{ kind: "remove_status", target: "@self", tag: "veneno" },
		],
	},
	{
		id: "sangrar",
		activation: "triggered",
		on: quandoTurnoDoControlador,
		effects: [{ kind: "damage", target: "@self", amount: 5, type: "veneno" }],
	},
	{
		id: "enlace",
		activation: "active",
		action: "usar_habilidade",
		target: { who: "enemy" },
		effects: [
			{ kind: "apply_status", target: "@target", status: "raiz", source: "@self" },
		],
	},
	{
		id: "investida",
		activation: "active",
		action: "atacar",
		target: { who: "enemy" },
		effects: [
			{ kind: "damage", target: "@target", amount: 9, type: "fisico", source: "@self" },
		],
	},
];

export const statuses: readonly StatusDef[] = [
	{
		id: "colera",
		tags: ["veneno"],
		duration: { kind: "permanent" },
		stack: "ignore",
		abilities: ["sangrar"],
		healGate: { allowTags: ["antidoto"] },
	},
	{
		id: "raiz",
		tags: ["controle"],
		duration: { kind: "turns", turns: 2, tickOn: "end", of: "holder" },
		stack: "refresh",
		blocks: ["mover"],
	},
	{
		id: "bruma",
		tags: ["controle"],
		duration: { kind: "turns", turns: 3, tickOn: "start", of: "any" },
		stack: "refresh",
	},
	{
		id: "fervor",
		tags: ["bonus"],
		duration: { kind: "permanent" },
		stack: "stack",
		maxStacks: 3,
		modifiers: [{ attr: "armadura", op: "add", value: 1 }],
	},
	{
		id: "marca",
		tags: ["controle"],
		duration: { kind: "turns", turns: 2, tickOn: "end", of: "holder" },
		stack: "replace",
		modifiers: [{ attr: "armadura", op: "add", value: -1 }],
		damageTaken: { arcano: 1.5 },
	},
];

export const unidades: readonly UnitDef[] = [
	{
		id: "aria",
		tags: ["personagem"],
		base: { constituicao: 5, mana_max: 20, armadura: 0 },
		abilities: [
			"golpe_lamina",
			"lampejo",
			"vigor_sereno",
			"mover_lago",
			"pocao_comum",
			"antidoto",
		],
	},
	{
		id: "espreitador_do_junco",
		tags: ["criatura"],
		base: { constituicao: 3, armadura: 3 },
		abilities: ["enlace", "investida"],
		immunities: ["veneno"],
		resist: { arcano: 0.25 },
	},
	{
		id: "cota_de_escamas",
		tags: ["item"],
		base: {},
		abilities: [],
		slot: "corpo",
		equipModifiers: [
			{ attr: "armadura", op: "add", value: 3 },
			{ attr: "constituicao", op: "add", value: 1 },
		],
	},
	{
		id: "lago_turvo",
		tags: ["area"],
		base: {},
		abilities: [],
		aura: {
			modifiers: [{ attr: "armadura", op: "add", value: -2 }],
			onEnter: [{ kind: "apply_status", target: "@target", status: "colera" }],
		},
	},
];

export function criarCatalogo(): UnitCatalog {
	return createUnitCatalog({
		rules: regras,
		units: unidades,
		abilities: habilidades,
		statuses,
	});
}

export function criarRegistro(): KindsRpg {
	return createKindRegistryFrom<Rpg, UnitCtx>(
		engineBuiltinKinds<RpgGame>() as never,
		unitKinds<RpgGame>() as never,
	) as unknown as KindsRpg;
}

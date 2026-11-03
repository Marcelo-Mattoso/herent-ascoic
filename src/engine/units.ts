import type { KindNode } from "./kinds";
import type { CounterRef, EngineEventMap, EngineState } from "./state";

export type UnitId = string;
export type Comparison = "lt" | "lte" | "eq" | "gte" | "gt";
export type ModifierOp = "add" | "mul" | "set" | "min" | "max";
export type Rounding = "floor" | "ceil" | "round";
export type Activation = "active" | "static" | "triggered";
export type StackPolicy = "ignore" | "refresh" | "stack" | "replace";

export interface DerivedTerm {
	readonly from: string;
	readonly mul?: number;
	readonly add?: number;
}

export interface AttributeDef {
	readonly id: string;
	readonly kind: "stat" | "pool";
	readonly default?: number;
	readonly derived?: readonly DerivedTerm[];
	readonly min?: number;
	readonly max?: number | { readonly attr: string };
	readonly round?: Rounding;
}

export interface ModifierDecl {
	readonly attr: string;
	readonly op: ModifierOp;
	readonly value: number;
	readonly when?: KindNode;
}

export interface UnitTargetSelector {
	readonly who: "self" | "ally" | "enemy" | "any";
	readonly tags?: readonly string[];
	readonly inArea?: string;
	readonly min?: number;
	readonly max?: number;
}

export interface TriggerDecl {
	readonly event: string;
	readonly scope?: "controller" | "unit" | "any";
}

export interface AbilityCost {
	readonly pool: string;
	readonly amount: number;
}

export interface AbilityDef {
	readonly id: string;
	readonly activation: Activation;
	readonly action?: string;
	readonly condition?: KindNode;
	readonly target?: UnitTargetSelector;
	readonly effects: readonly KindNode[];
	readonly cost?: readonly AbilityCost[];
	readonly cooldown?: {
		readonly turns: number;
		readonly tickOn?: "start" | "end";
	};
	readonly modifiers?: readonly ModifierDecl[];
	readonly immunities?: readonly string[];
	readonly on?: TriggerDecl;
	readonly priority?: number;
	readonly limit?: { readonly scope: string; readonly times: number };
}

export interface AuraDef {
	readonly filter?: KindNode;
	readonly modifiers?: readonly ModifierDecl[];
	readonly onEnter?: readonly KindNode[];
	readonly onLeave?: readonly KindNode[];
	readonly onTurnStart?: readonly KindNode[];
}

export interface UnitDef {
	readonly id: string;
	readonly tags: readonly string[];
	readonly base: Readonly<Record<string, number>>;
	readonly abilities: readonly string[];
	readonly slot?: string;
	readonly equipModifiers?: readonly ModifierDecl[];
	readonly equipAbilities?: readonly string[];
	readonly aura?: AuraDef;
}

export type StatusDuration =
	| { readonly kind: "permanent" }
	| {
			readonly kind: "turns";
			readonly turns: number;
			readonly tickOn: "start" | "end";
			readonly of: "holder" | "any";
	  }
	| { readonly kind: "scope"; readonly scope: string };

export interface StatusDef {
	readonly id: string;
	readonly tags: readonly string[];
	readonly duration: StatusDuration;
	readonly stack: StackPolicy;
	readonly maxStacks?: number;
	readonly modifiers?: readonly ModifierDecl[];
	readonly abilities?: readonly string[];
	readonly blocks?: readonly string[];
	readonly healGate?: { readonly allowTags: readonly string[] };
	readonly damageTaken?: Readonly<Record<string, number>>;
}

export interface StatusInstance {
	readonly status: string;
	readonly stacks: number;
	readonly remaining: number | null;
	readonly scope?: string;
	readonly source?: UnitId;
}

export interface BlockInstance {
	readonly action: string;
	readonly remaining: number;
}

export interface UnitInstance {
	readonly id: UnitId;
	readonly def: string;
	readonly controller?: string;
	readonly tags: readonly string[];
	readonly base: Readonly<Record<string, number>>;
	readonly pools: Readonly<Record<string, number>>;
	readonly statuses: readonly StatusInstance[];
	readonly blocks: readonly BlockInstance[];
	readonly equippedTo?: UnitId;
	readonly slot?: string;
	readonly presentIn: readonly UnitId[];
	readonly cooldowns: Readonly<Record<string, number>>;
}

export interface DamageProposal {
	readonly target: UnitId;
	readonly source?: UnitId;
	readonly type: string;
	readonly amount: number;
}

export interface HealProposal {
	readonly target: UnitId;
	readonly source?: UnitId;
	readonly tags: readonly string[];
	readonly pool: string;
	readonly amount: number;
}

export interface UnitHookContext {
	readonly state: EngineState<EngineEventMap>;
	readonly catalog: UnitCatalog;
}

export const LATE_HOOK_PRIORITY = 100;

export interface DamageHook {
	readonly id: string;
	readonly priority: number;
	apply(proposal: DamageProposal, ctx: UnitHookContext): DamageProposal;
}

export interface HealHook {
	readonly id: string;
	readonly priority: number;
	apply(proposal: HealProposal, ctx: UnitHookContext): HealProposal;
}

export interface ConditionContext {
	readonly state: EngineState<EngineEventMap>;
	readonly catalog: UnitCatalog;
	readonly subject: UnitId;
}

export interface UnitRules {
	readonly attributes: readonly AttributeDef[];
	readonly lifePool: string;
	readonly mitigation?: readonly {
		readonly type: string;
		readonly attr: string;
	}[];
	readonly resistance?: readonly {
		readonly type: string;
		readonly attr: string;
	}[];
	readonly damageHooks?: readonly DamageHook[];
	readonly healHooks?: readonly HealHook[];
	readonly conditions?: Readonly<
		Record<string, (node: KindNode, ctx: ConditionContext) => boolean>
	>;
	readonly maxReactions?: number;
}

export interface UnitCatalog {
	readonly rules: UnitRules;
	readonly attributeDef: (id: string) => AttributeDef;
	readonly hasAttribute: (id: string) => boolean;
	readonly unitDef: (id: string) => UnitDef;
	readonly abilityDef: (id: string) => AbilityDef;
	readonly statusDef: (id: string) => StatusDef;
	readonly attributeDefs: () => readonly AttributeDef[];
	readonly unitDefs: () => readonly UnitDef[];
	readonly abilityDefs: () => readonly AbilityDef[];
	readonly statusDefs: () => readonly StatusDef[];
}

export interface UnitContentInit {
	readonly rules: UnitRules;
	readonly units?: readonly UnitDef[];
	readonly abilities?: readonly AbilityDef[];
	readonly statuses?: readonly StatusDef[];
}

export const DEFAULT_MAX_REACTIONS = 32;

function fail(message: string): never {
	throw new Error(`unidades: ${message}`);
}

function indexById<T extends { readonly id: string }>(
	list: readonly T[],
	label: string,
): Map<string, T> {
	const map = new Map<string, T>();
	for (const item of list) {
		if (item.id === "") fail(`${label} sem id`);
		if (map.has(item.id)) fail(`${label} duplicado: "${item.id}"`);
		map.set(item.id, item);
	}
	return map;
}

export function nodesIn(value: unknown): KindNode[] {
	if (Array.isArray(value)) return value.flatMap(nodesIn);
	if (typeof value !== "object" || value === null) return [];
	const own =
		typeof (value as { kind?: unknown }).kind === "string"
			? [value as KindNode]
			: [];
	return [...own, ...Object.values(value).flatMap(nodesIn)];
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) deepFreeze(child);
	return Object.freeze(value);
}

export function modifiersOfAbility(
	ability: AbilityDef,
): readonly ModifierDecl[] {
	return ability.activation === "static" ? (ability.modifiers ?? []) : [];
}

export function createUnitCatalog(init: UnitContentInit): UnitCatalog {
	const { rules } = init;
	const attributes = indexById(rules.attributes, "atributo");
	const units = indexById(init.units ?? [], "unidade");
	const abilities = indexById(init.abilities ?? [], "habilidade");
	const statuses = indexById(init.statuses ?? [], "status");

	const attributeKnown = (id: string, where: string) => {
		if (!attributes.has(id))
			fail(`${where} cita atributo desconhecido "${id}"`);
	};
	const poolKnown = (id: string, where: string) => {
		if (attributes.get(id)?.kind !== "pool") {
			fail(`${where} cita recurso desconhecido "${id}"`);
		}
	};
	const checkModifiers = (
		list: readonly ModifierDecl[] | undefined,
		where: string,
	) => {
		for (const modifier of list ?? []) {
			attributeKnown(modifier.attr, where);
			if (!Number.isFinite(modifier.value)) fail(`${where} com valor inválido`);
		}
	};

	for (const attribute of attributes.values()) {
		const where = `atributo "${attribute.id}"`;
		for (const term of attribute.derived ?? []) {
			attributeKnown(term.from, where);
			if (term.from === attribute.id) fail(`${where} deriva de si mesmo`);
		}
		if (typeof attribute.max === "object")
			attributeKnown(attribute.max.attr, where);
	}
	for (const attribute of attributes.values()) {
		const seen = new Set<string>();
		const walk = (id: string) => {
			if (seen.has(id)) fail(`derivação em ciclo em "${attribute.id}"`);
			seen.add(id);
			for (const term of attributes.get(id)?.derived ?? []) walk(term.from);
			seen.delete(id);
		};
		walk(attribute.id);
	}
	poolKnown(rules.lifePool, "regras");
	for (const rule of rules.mitigation ?? []) {
		attributeKnown(rule.attr, `mitigação de "${rule.type}"`);
	}
	for (const rule of rules.resistance ?? []) {
		attributeKnown(rule.attr, `resistência a "${rule.type}"`);
	}
	const hookIds = new Set<string>();
	for (const hook of [
		...(rules.damageHooks ?? []),
		...(rules.healHooks ?? []),
	]) {
		if (hookIds.has(hook.id)) fail(`hook duplicado: "${hook.id}"`);
		hookIds.add(hook.id);
	}

	const abilityKnown = (id: string, where: string) => {
		if (!abilities.has(id))
			fail(`${where} cita habilidade desconhecida "${id}"`);
	};
	for (const ability of abilities.values()) {
		const where = `habilidade "${ability.id}"`;
		if (ability.activation === "triggered" && !ability.on) {
			fail(`${where} gatilho sem "on"`);
		}
		if (ability.activation !== "triggered" && ability.on) {
			fail(`${where} só gatilho pode ter "on"`);
		}
		if (ability.activation === "static" && ability.effects.length > 0) {
			fail(`${where} estática não tem efeitos`);
		}
		if (ability.activation !== "static" && ability.modifiers?.length) {
			fail(`${where} só estática tem modificadores`);
		}
		if (ability.activation !== "static" && ability.immunities?.length) {
			fail(`${where} só estática tem imunidades`);
		}
		for (const cost of ability.cost ?? []) {
			poolKnown(cost.pool, where);
			if (!Number.isInteger(cost.amount) || cost.amount < 0) {
				fail(`${where} com custo inválido`);
			}
		}
		if (ability.cooldown && !(ability.cooldown.turns >= 1)) {
			fail(`${where} com recarga inválida`);
		}
		if (ability.limit && !(ability.limit.times >= 1)) {
			fail(`${where} com limite inválido`);
		}
		checkModifiers(ability.modifiers, where);
	}
	for (const status of statuses.values()) {
		const where = `status "${status.id}"`;
		if (status.duration.kind === "turns" && !(status.duration.turns >= 1)) {
			fail(`${where} com duração inválida`);
		}
		if (status.maxStacks !== undefined && !(status.maxStacks >= 1)) {
			fail(`${where} com maxStacks inválido`);
		}
		checkModifiers(status.modifiers, where);
		for (const id of status.abilities ?? []) abilityKnown(id, where);
	}
	for (const unit of units.values()) {
		const where = `unidade "${unit.id}"`;
		for (const attr of Object.keys(unit.base)) attributeKnown(attr, where);
		for (const id of [...unit.abilities, ...(unit.equipAbilities ?? [])]) {
			abilityKnown(id, where);
		}
		checkModifiers(unit.equipModifiers, where);
		checkModifiers(unit.aura?.modifiers, `${where} > aura`);
	}
	const statusRefs = [
		...[...abilities.values()].flatMap((a) => nodesIn(a)),
		...[...units.values()].flatMap((u) => nodesIn(u.aura)),
	];
	for (const node of statusRefs) {
		const status = (node as { status?: unknown }).status;
		if (
			(node.kind === "apply_status" || node.kind === "remove_status") &&
			typeof status === "string" &&
			!statuses.has(status)
		) {
			fail(`"${node.kind}" cita status desconhecido "${status}"`);
		}
	}

	const frozen = {
		rules,
		attributes: deepFreeze([...attributes.values()]),
		units: deepFreeze([...units.values()]),
		abilities: deepFreeze([...abilities.values()]),
		statuses: deepFreeze([...statuses.values()]),
	};
	const get = <T>(map: Map<string, T>, id: string, label: string): T => {
		const found = map.get(id);
		if (found === undefined) fail(`${label} inexistente: "${id}"`);
		return found;
	};
	const catalog: UnitCatalog = {
		rules,
		attributeDef: (id) => get(attributes, id, "atributo"),
		hasAttribute: (id) => attributes.has(id),
		unitDef: (id) => get(units, id, "unidade"),
		abilityDef: (id) => get(abilities, id, "habilidade"),
		statusDef: (id) => get(statuses, id, "status"),
		attributeDefs: () => frozen.attributes,
		unitDefs: () => frozen.units,
		abilityDefs: () => frozen.abilities,
		statusDefs: () => frozen.statuses,
	};
	return Object.freeze(catalog);
}

export function unitContentNodes(
	catalog: UnitCatalog,
): { readonly origin: string; readonly nodes: readonly KindNode[] }[] {
	const out: { origin: string; nodes: KindNode[] }[] = [];
	const add = (
		origin: string,
		...lists: (readonly KindNode[] | KindNode | undefined)[]
	) => {
		const nodes = lists.flatMap((entry) =>
			entry === undefined ? [] : Array.isArray(entry) ? entry : [entry],
		) as KindNode[];
		if (nodes.length > 0) out.push({ origin, nodes });
	};
	const modifierConditions = (list?: readonly ModifierDecl[]) =>
		(list ?? []).flatMap((m) => (m.when ? [m.when] : []));
	for (const a of catalog.abilityDefs()) {
		add(
			`habilidade ${a.id}`,
			a.effects,
			a.condition,
			modifierConditions(a.modifiers),
		);
	}
	for (const s of catalog.statusDefs()) {
		add(`status ${s.id}`, modifierConditions(s.modifiers));
	}
	for (const u of catalog.unitDefs()) {
		add(
			`unidade ${u.id}`,
			modifierConditions(u.equipModifiers),
			u.aura?.filter,
			modifierConditions(u.aura?.modifiers),
			u.aura?.onEnter,
			u.aura?.onLeave,
			u.aura?.onTurnStart,
		);
	}
	return out;
}

export function bindNodes(
	nodes: readonly KindNode[],
	bindings: Readonly<Record<string, string>>,
): KindNode[] {
	const walk = (value: unknown): unknown => {
		if (typeof value === "string") {
			return value.startsWith("@")
				? (bindings[value.slice(1)] ?? value)
				: value;
		}
		if (Array.isArray(value)) return value.map(walk);
		if (typeof value === "object" && value !== null) {
			return Object.fromEntries(
				Object.entries(value).map(([key, child]) => [key, walk(child)]),
			);
		}
		return value;
	};
	return nodes.map((node) => walk(node) as KindNode);
}

export function limitRef(
	unit: UnitId,
	def: AbilityDef,
): CounterRef | undefined {
	return def.limit
		? { scope: def.limit.scope, id: unit, name: `limite:${def.id}` }
		: undefined;
}

export function widen<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): EngineState<EngineEventMap> {
	return state as unknown as EngineState<EngineEventMap>;
}

export function unitOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	id: UnitId,
): UnitInstance {
	const found = state.units?.[id];
	if (!found) throw new Error(`Unidade desconhecida: "${id}"`);
	return found;
}

export function hasUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	id: UnitId,
): boolean {
	return state.units?.[id] !== undefined;
}

export function unitsOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): readonly UnitInstance[] {
	return Object.values(state.units ?? {}).sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
}

export function isArea(unit: UnitInstance): boolean {
	return unit.tags.includes("area");
}

export function putUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	unit: UnitInstance,
): EngineState<TMap> {
	return { ...state, units: { ...state.units, [unit.id]: unit } };
}

export function patchUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	id: UnitId,
	patch: Partial<UnitInstance>,
): EngineState<TMap> {
	return putUnit(state, { ...unitOf(state, id), ...patch });
}

export function dropUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	id: UnitId,
): EngineState<TMap> {
	unitOf(state, id);
	const { [id]: _removed, ...units } = state.units ?? {};
	return { ...state, units };
}

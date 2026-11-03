import type { EventMeta } from "./events";
import type { KindNode } from "./kinds";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import {
	type AbilityDef,
	type AttributeDef,
	type Comparison,
	modifiersOfAbility,
	type ModifierDecl,
	patchUnit,
	type UnitCatalog,
	type UnitId,
	unitOf,
	unitsOf,
	widen,
} from "./units";

export interface ModifierSource {
	readonly kind: "unit" | "status" | "item" | "area";
	readonly id: string;
}

export interface ActiveModifier extends ModifierDecl {
	readonly source: ModifierSource;
}

export interface AbilityRef {
	readonly def: AbilityDef;
	readonly holder: UnitId;
	readonly source: ModifierSource;
}

const MAX_DEPTH = 8;
let depth = 0;

function compare(op: Comparison, left: number, right: number): boolean {
	return {
		lt: left < right,
		lte: left <= right,
		eq: left === right,
		gte: left >= right,
		gt: left > right,
	}[op];
}

export function testCondition<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	subject: UnitId,
	node: KindNode,
): boolean {
	const negate = (node as { negate?: boolean }).negate === true;
	const holds = (): boolean => {
		const unit = unitOf(state, subject);
		switch (node.kind) {
			case "in_area": {
				const wanted = String((node as { area?: unknown }).area);
				return unit.presentIn.some(
					(area) => area === wanted || state.units?.[area]?.def === wanted,
				);
			}
			case "has_status": {
				const { status, tag } = node as { status?: string; tag?: string };
				return unit.statuses.some(
					(entry) =>
						(status !== undefined && entry.status === status) ||
						(tag !== undefined &&
							catalog.statusDef(entry.status).tags.includes(tag)),
				);
			}
			case "attr_compare": {
				const { attr, op, value } = node as unknown as {
					attr: string;
					op: Comparison;
					value: number;
				};
				return compare(op, attributeOf(state, catalog, subject, attr), value);
			}
			default: {
				const custom = catalog.rules.conditions?.[node.kind];
				if (!custom) throw new Error(`Condição desconhecida: "${node.kind}"`);
				return custom(node, {
					state: widen(state),
					catalog,
					subject,
				});
			}
		}
	};
	return holds() !== negate;
}

export function abilitiesOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
): readonly AbilityRef[] {
	const instance = unitOf(state, unit);
	const refs: AbilityRef[] = [];
	const add = (ids: readonly string[], source: ModifierSource) => {
		for (const id of ids) {
			refs.push({ def: catalog.abilityDef(id), holder: unit, source });
		}
	};
	add(catalog.unitDef(instance.def).abilities, { kind: "unit", id: unit });
	for (const status of instance.statuses) {
		add(catalog.statusDef(status.status).abilities ?? [], {
			kind: "status",
			id: status.status,
		});
	}
	for (const item of unitsOf(state)) {
		if (item.equippedTo !== unit) continue;
		add(catalog.unitDef(item.def).equipAbilities ?? [], {
			kind: "item",
			id: item.id,
		});
	}
	return refs;
}

function scaled(
	modifier: ModifierDecl,
	source: ModifierSource,
	stacks: number,
): ActiveModifier {
	if (stacks === 1) return { ...modifier, source };
	const value =
		modifier.op === "add"
			? modifier.value * stacks
			: modifier.op === "mul"
				? modifier.value ** stacks
				: modifier.value;
	return { ...modifier, value, source };
}

export function activeModifiers<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
): readonly ActiveModifier[] {
	const instance = unitOf(state, unit);
	const found: ActiveModifier[] = [];
	const collect = (
		list: readonly ModifierDecl[] | undefined,
		source: ModifierSource,
		stacks = 1,
	) => {
		for (const modifier of list ?? []) {
			if (
				modifier.when &&
				!testCondition(state, catalog, unit, modifier.when)
			) {
				continue;
			}
			found.push(scaled(modifier, source, stacks));
		}
	};
	for (const ref of abilitiesOf(state, catalog, unit)) {
		collect(modifiersOfAbility(ref.def), ref.source);
	}
	for (const status of instance.statuses) {
		collect(
			catalog.statusDef(status.status).modifiers,
			{ kind: "status", id: status.status },
			status.stacks,
		);
	}
	for (const item of unitsOf(state)) {
		if (item.equippedTo === unit) {
			collect(catalog.unitDef(item.def).equipModifiers, {
				kind: "item",
				id: item.id,
			});
		}
	}
	for (const areaId of instance.presentIn) {
		const area = state.units?.[areaId];
		const aura = area ? catalog.unitDef(area.def).aura : undefined;
		if (!aura) continue;
		if (aura.filter && !testCondition(state, catalog, unit, aura.filter)) {
			continue;
		}
		collect(aura.modifiers, { kind: "area", id: areaId });
	}
	return found;
}

function rounded(def: AttributeDef, value: number): number {
	return def.round ? Math[def.round](value) : value;
}

function bounds<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	def: AttributeDef,
): { min: number; max: number } {
	const max =
		typeof def.max === "object"
			? attributeOf(state, catalog, unit, def.max.attr)
			: (def.max ?? Number.POSITIVE_INFINITY);
	return {
		min: def.min ?? (def.kind === "pool" ? 0 : Number.NEGATIVE_INFINITY),
		max,
	};
}

export function attributeOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	attr: string,
): number {
	if (depth >= MAX_DEPTH) {
		throw new Error(`Cálculo de "${attr}" excedeu a profundidade (ciclo?)`);
	}
	depth++;
	try {
		const def = catalog.attributeDef(attr);
		const instance = unitOf(state, unit);
		const { min, max } = bounds(state, catalog, unit, def);
		let value: number;
		if (def.kind === "pool") {
			value = instance.pools[attr] ?? def.default ?? 0;
		} else {
			value = instance.base[attr] ?? def.default ?? 0;
			for (const term of def.derived ?? []) {
				value +=
					attributeOf(state, catalog, unit, term.from) * (term.mul ?? 1) +
					(term.add ?? 0);
			}
			const mods = activeModifiers(state, catalog, unit).filter(
				(modifier) => modifier.attr === attr,
			);
			const of = (op: string) => mods.filter((modifier) => modifier.op === op);
			value += of("add").reduce((sum, modifier) => sum + modifier.value, 0);
			value = of("mul").reduce((acc, modifier) => acc * modifier.value, value);
			const set = of("set").at(-1);
			if (set) value = set.value;
			for (const modifier of of("min")) value = Math.max(value, modifier.value);
			for (const modifier of of("max")) value = Math.min(value, modifier.value);
			value = rounded(def, value);
		}
		return Math.min(Math.max(value, min), max);
	} finally {
		depth--;
	}
}

export function poolMax<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	pool: string,
): number {
	const def = catalog.attributeDef(pool);
	if (def.kind !== "pool") throw new Error(`"${pool}" não é um recurso`);
	return bounds(state, catalog, unit, def).max;
}

export function clampPools<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	meta?: EventMeta,
): EngineState<TMap> {
	let current = state;
	for (const def of catalog.attributeDefs()) {
		if (def.kind !== "pool") continue;
		const stored = unitOf(current, unit).pools[def.id];
		if (stored === undefined) continue;
		const clamped = attributeOf(current, catalog, unit, def.id);
		if (clamped === stored) continue;
		current = patchUnit(current, unit, {
			pools: { ...unitOf(current, unit).pools, [def.id]: clamped },
		});
		current = recordEvent(
			current,
			"atributo.alterado",
			{ unit, attr: def.id, from: stored, to: clamped, reason: "corte" },
			meta,
		);
	}
	return current;
}

export function setPool<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	unit: UnitId,
	pool: string,
	value: number,
): EngineState<TMap> {
	return patchUnit(state, unit, {
		pools: { ...unitOf(state, unit).pools, [pool]: value },
	});
}

import { leaveArea } from "./areas";
import { clampPools, poolMax, setPool } from "./attributes";
import type { EventMeta } from "./events";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import {
	dropUnit,
	hasUnit,
	isArea,
	patchUnit,
	putUnit,
	type UnitCatalog,
	type UnitId,
	unitOf,
	unitsOf,
} from "./units";

export interface SpawnInit {
	readonly id: UnitId;
	readonly def: string;
	readonly controller?: string;
	readonly tags?: readonly string[];
	readonly base?: Readonly<Record<string, number>>;
	readonly pools?: Readonly<Record<string, number>>;
}

export function spawnUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	init: SpawnInit,
	meta?: EventMeta,
): EngineState<TMap> {
	if (hasUnit(state, init.id)) {
		throw new Error(`Unidade duplicada: "${init.id}"`);
	}
	const def = catalog.unitDef(init.def);
	let current = putUnit(state, {
		id: init.id,
		def: def.id,
		...(init.controller === undefined ? {} : { controller: init.controller }),
		tags: [...new Set([...def.tags, ...(init.tags ?? [])])],
		base: { ...def.base, ...init.base },
		pools: {},
		statuses: [],
		blocks: [],
		presentIn: [],
		cooldowns: {},
	});
	for (const attr of catalog.attributeDefs()) {
		if (attr.kind !== "pool") continue;
		const max = poolMax(current, catalog, init.id, attr.id);
		const initial =
			init.pools?.[attr.id] ??
			(Number.isFinite(max) ? max : (attr.default ?? 0));
		current = setPool(current, init.id, attr.id, initial);
	}
	current = clampPools(current, catalog, init.id, meta);
	return recordEvent(
		current,
		"unidade.criada",
		{ unit: init.id, def: def.id },
		meta,
	);
}

export function equip<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	item: UnitId,
	holder: UnitId,
	slot?: string,
	meta?: EventMeta,
): EngineState<TMap> {
	const piece = unitOf(state, item);
	unitOf(state, holder);
	if (piece.equippedTo !== undefined) {
		throw new Error(`Item "${item}" já está equipado`);
	}
	const where = slot ?? catalog.unitDef(piece.def).slot;
	if (
		where !== undefined &&
		unitsOf(state).some(
			(other) => other.equippedTo === holder && other.slot === where,
		)
	) {
		throw new Error(`Espaço "${where}" de "${holder}" ocupado`);
	}
	const equipped = patchUnit(state, item, {
		equippedTo: holder,
		...(where === undefined ? {} : { slot: where }),
	});
	return clampPools(
		recordEvent(
			equipped,
			"item.equipado",
			{ item, holder, ...(where === undefined ? {} : { slot: where }) },
			meta,
		),
		catalog,
		holder,
		meta,
	);
}

export function unequip<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	item: UnitId,
	meta?: EventMeta,
): EngineState<TMap> {
	const holder = unitOf(state, item).equippedTo;
	if (holder === undefined) throw new Error(`Item "${item}" não está equipado`);
	const bare = patchUnit(state, item, {
		equippedTo: undefined,
		slot: undefined,
	});
	return clampPools(
		recordEvent(bare, "item.desequipado", { item, holder }, meta),
		catalog,
		holder,
		meta,
	);
}

export function despawnUnit<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	id: UnitId,
	meta?: EventMeta,
): EngineState<TMap> {
	const unit = unitOf(state, id);
	let current = state;
	if (unit.equippedTo !== undefined) {
		current = unequip(current, catalog, id, meta);
	}
	for (const worn of unitsOf(current)) {
		if (worn.equippedTo === id)
			current = unequip(current, catalog, worn.id, meta);
	}
	if (isArea(unit)) {
		for (const other of unitsOf(current)) {
			if (other.presentIn.includes(id)) {
				current = leaveArea(current, catalog, other.id, id, meta, "removida");
			}
		}
	}
	for (const other of unitsOf(current)) {
		if (other.presentIn.includes(id)) {
			current = patchUnit(current, other.id, {
				presentIn: other.presentIn.filter((entry) => entry !== id),
			});
		}
	}
	current = dropUnit(current, id);
	return recordEvent(current, "unidade.removida", { unit: id }, meta);
}

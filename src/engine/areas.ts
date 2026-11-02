import { clampPools } from "./attributes";
import type { EventMeta } from "./events";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import {
	isArea,
	patchUnit,
	type UnitCatalog,
	type UnitId,
	unitOf,
	unitsOf,
} from "./units";

function assertArea<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	area: UnitId,
): void {
	if (!isArea(unitOf(state, area))) {
		throw new Error(`Unidade "${area}" não é uma área`);
	}
}

export function areaMembers<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	area: UnitId,
): readonly UnitId[] {
	return unitsOf(state)
		.filter((unit) => unit.presentIn.includes(area))
		.map((unit) => unit.id);
}

export function enterArea<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	area: UnitId,
	meta?: EventMeta,
): EngineState<TMap> {
	assertArea(state, area);
	if (unit === area) throw new Error("Uma área não entra em si mesma");
	const instance = unitOf(state, unit);
	if (instance.presentIn.includes(area)) return state;
	const entered = patchUnit(state, unit, {
		presentIn: [...instance.presentIn, area],
	});
	return clampPools(
		recordEvent(entered, "area.entrou", { unit, area }, meta),
		catalog,
		unit,
		meta,
	);
}

export function leaveArea<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	area: UnitId,
	meta?: EventMeta,
	reason?: string,
): EngineState<TMap> {
	const instance = unitOf(state, unit);
	if (!instance.presentIn.includes(area)) return state;
	const left = patchUnit(state, unit, {
		presentIn: instance.presentIn.filter((entry) => entry !== area),
	});
	return clampPools(
		recordEvent(
			left,
			"area.saiu",
			{ unit, area, ...(reason === undefined ? {} : { reason }) },
			meta,
		),
		catalog,
		unit,
		meta,
	);
}

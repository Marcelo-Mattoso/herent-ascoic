import { clampPools } from "./attributes";
import type { EventMeta } from "./events";
import type { ScopeRegistry } from "./scopes";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import {
	type StatusDef,
	type StatusInstance,
	type UnitCatalog,
	type UnitId,
	patchUnit,
	unitOf,
	unitsOf,
} from "./units";

export type ActionCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly by: string };

export interface StatusSelector {
	readonly status?: string;
	readonly tag?: string;
}

export function statusesOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	unit: UnitId,
): readonly StatusInstance[] {
	return unitOf(state, unit).statuses;
}

export function isImmune<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	status: string,
): string | undefined {
	const immunities = catalog.unitDef(unitOf(state, unit).def).immunities ?? [];
	const def = catalog.statusDef(status);
	return immunities.find(
		(entry) => entry === def.id || def.tags.includes(entry),
	);
}

function freshInstance(
	def: StatusDef,
	source?: UnitId,
	stacks = 1,
): StatusInstance {
	return {
		status: def.id,
		stacks,
		remaining: def.duration.kind === "turns" ? def.duration.turns : null,
		...(def.duration.kind === "scope" ? { scope: def.duration.scope } : {}),
		...(source === undefined ? {} : { source }),
	};
}

export function removeStatus<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	selector: StatusSelector,
	reason = "removido",
	meta?: EventMeta,
): EngineState<TMap> {
	let current = state;
	const doomed = unitOf(state, unit).statuses.filter(
		(entry) =>
			entry.status === selector.status ||
			(selector.tag !== undefined &&
				catalog.statusDef(entry.status).tags.includes(selector.tag)),
	);
	if (doomed.length === 0) return state;
	current = patchUnit(current, unit, {
		statuses: unitOf(current, unit).statuses.filter(
			(entry) => !doomed.includes(entry),
		),
	});
	for (const entry of doomed) {
		current = recordEvent(
			current,
			"status.removido",
			{ unit, status: entry.status, reason },
			meta,
		);
	}
	return clampPools(current, catalog, unit, meta);
}

export function applyStatus<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	status: string,
	source?: UnitId,
	meta?: EventMeta,
): EngineState<TMap> {
	const def = catalog.statusDef(status);
	const blocker = isImmune(state, catalog, unit, status);
	if (blocker !== undefined) {
		return recordEvent(
			state,
			"status.imune",
			{ unit, status, by: blocker },
			meta,
		);
	}
	const existing = unitOf(state, unit).statuses.find(
		(entry) => entry.status === status,
	);
	let current = state;
	let next: StatusInstance;
	if (existing === undefined) {
		next = freshInstance(def, source);
	} else if (def.stack === "ignore") {
		return state;
	} else if (def.stack === "replace") {
		current = removeStatus(
			current,
			catalog,
			unit,
			{ status },
			"substituido",
			meta,
		);
		next = freshInstance(def, source);
	} else {
		const stacks =
			def.stack === "stack"
				? Math.min(
						existing.stacks + 1,
						def.maxStacks ?? Number.POSITIVE_INFINITY,
					)
				: existing.stacks;
		next = freshInstance(def, source ?? existing.source, stacks);
	}
	const held = unitOf(current, unit).statuses;
	const statuses = held.some((entry) => entry.status === status)
		? held.map((entry) => (entry.status === status ? next : entry))
		: [...held, next];
	current = patchUnit(current, unit, { statuses });
	current = recordEvent(
		current,
		"status.aplicado",
		{
			unit,
			status,
			stacks: next.stacks,
			...(source === undefined ? {} : { source }),
		},
		meta,
	);
	return clampPools(current, catalog, unit, meta);
}

export function canAct<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	action: string,
): ActionCheck {
	const instance = unitOf(state, unit);
	for (const entry of instance.statuses) {
		if (catalog.statusDef(entry.status).blocks?.includes(action)) {
			return { ok: false, by: entry.status };
		}
	}
	if (instance.blocks.some((block) => block.action === action)) {
		return { ok: false, by: "bloqueio" };
	}
	return { ok: true };
}

export function addBlock<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	unit: UnitId,
	action: string,
	turns: number,
): EngineState<TMap> {
	const others = unitOf(state, unit).blocks.filter(
		(block) => block.action !== action,
	);
	return patchUnit(state, unit, {
		blocks: [...others, { action, remaining: turns }],
	});
}

export function tickStatuses<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	player: string,
	on: "start" | "end",
	meta?: EventMeta,
): EngineState<TMap> {
	let current = state;
	for (const { id } of unitsOf(state)) {
		const unit = unitOf(current, id);
		const ownTurn = unit.controller === player;
		const expired: string[] = [];
		const statuses = unit.statuses.map((entry) => {
			const duration = catalog.statusDef(entry.status).duration;
			if (
				duration.kind !== "turns" ||
				duration.tickOn !== on ||
				(duration.of === "holder" && !ownTurn)
			) {
				return entry;
			}
			const remaining = (entry.remaining ?? 0) - 1;
			if (remaining <= 0) expired.push(entry.status);
			return { ...entry, remaining };
		});
		const blocks =
			on === "end" && ownTurn
				? unit.blocks
						.map((block) => ({ ...block, remaining: block.remaining - 1 }))
						.filter((block) => block.remaining > 0)
				: unit.blocks;
		current = patchUnit(current, id, {
			statuses: statuses.filter((entry) => !expired.includes(entry.status)),
			blocks,
		});
		for (const status of expired) {
			current = recordEvent(
				current,
				"status.removido",
				{ unit: id, status, reason: "expirou" },
				meta,
			);
		}
		if (expired.length > 0) current = clampPools(current, catalog, id, meta);
	}
	return current;
}

export function tickCooldowns<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	player: string,
	on: "start" | "end",
): EngineState<TMap> {
	let current = state;
	for (const unit of unitsOf(state)) {
		if (unit.controller !== player) continue;
		const cooldowns: Record<string, number> = {};
		for (const [ability, left] of Object.entries(unit.cooldowns)) {
			const tick = catalog.abilityDef(ability).cooldown?.tickOn ?? "start";
			const next = tick === on ? left - 1 : left;
			if (next > 0) cooldowns[ability] = next;
		}
		current = patchUnit(current, unit.id, { cooldowns });
	}
	return current;
}

export function expireScope<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	scopes: ScopeRegistry,
	ended: string,
	meta?: EventMeta,
): EngineState<TMap> {
	let current = state;
	for (const { id } of unitsOf(state)) {
		for (const entry of unitOf(current, id).statuses) {
			const duration = catalog.statusDef(entry.status).duration;
			if (
				duration.kind === "scope" &&
				scopes.has(duration.scope) &&
				scopes.isWithin(duration.scope, ended)
			) {
				current = removeStatus(
					current,
					catalog,
					id,
					{ status: entry.status },
					"escopo",
					meta,
				);
			}
		}
	}
	return current;
}

import { attributeOf, poolMax, setPool } from "./attributes";
import type { EventMeta } from "./events";
import { type EngineEventMap, type EngineState, recordEvent } from "./state";
import {
	type DamageProposal,
	type HealProposal,
	LATE_HOOK_PRIORITY,
	type UnitCatalog,
	type UnitHookContext,
	type UnitId,
	unitOf,
	widen,
} from "./units";

export interface DamageInput {
	readonly target: UnitId;
	readonly source?: UnitId;
	readonly type: string;
	readonly amount: number;
}

export interface HealInput {
	readonly target: UnitId;
	readonly source?: UnitId;
	readonly tags?: readonly string[];
	readonly pool?: string;
	readonly amount: number;
}

const byPriority = <T extends { priority: number; id: string }>(
	hooks: readonly T[] | undefined,
): T[] =>
	[...(hooks ?? [])].sort(
		(a, b) =>
			a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	);

export function applyDamage<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	input: DamageInput,
	meta?: EventMeta,
): EngineState<TMap> {
	const { rules } = catalog;
	const start: DamageProposal = {
		target: input.target,
		type: input.type,
		amount: input.amount,
		...(input.source === undefined ? {} : { source: input.source }),
	};
	let current = recordEvent(state, "dano.proposto", { ...start }, meta);
	const hooks = byPriority(rules.damageHooks);
	const context = (): UnitHookContext => ({
		state: widen(current),
		catalog,
	});
	let proposal = start;
	for (const hook of hooks.filter((h) => h.priority < LATE_HOOK_PRIORITY)) {
		proposal = hook.apply(proposal, context());
	}

	const target = unitOf(current, proposal.target);
	const resist = catalog.unitDef(target.def).resist?.[proposal.type] ?? 0;
	let factor = 1 - resist;
	for (const entry of target.statuses) {
		factor *= catalog.statusDef(entry.status).damageTaken?.[proposal.type] ?? 1;
	}
	let amount = Math.round(proposal.amount * factor);
	for (const rule of rules.mitigation ?? []) {
		if (rule.type === proposal.type) {
			amount = Math.max(
				0,
				amount - attributeOf(current, catalog, proposal.target, rule.attr),
			);
		}
	}
	proposal = { ...proposal, amount };
	for (const hook of hooks.filter((h) => h.priority >= LATE_HOOK_PRIORITY)) {
		proposal = hook.apply(proposal, context());
	}

	const final = Math.max(0, proposal.amount);
	const before = unitOf(current, proposal.target).pools[rules.lifePool] ?? 0;
	const life = Math.max(0, before - final);
	current = setPool(current, proposal.target, rules.lifePool, life);
	current = recordEvent(
		current,
		"dano.aplicado",
		{
			target: proposal.target,
			type: proposal.type,
			proposed: input.amount,
			amount: final,
			life,
			...(proposal.source === undefined ? {} : { source: proposal.source }),
		},
		meta,
	);
	if (before > 0 && life === 0) {
		current = recordEvent(
			current,
			"unidade.derrotada",
			{
				unit: proposal.target,
				...(proposal.source === undefined ? {} : { by: proposal.source }),
			},
			meta,
		);
	}
	return current;
}

export function applyHeal<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	input: HealInput,
	meta?: EventMeta,
): EngineState<TMap> {
	const pool = input.pool ?? catalog.rules.lifePool;
	let proposal: HealProposal = {
		target: input.target,
		tags: input.tags ?? [],
		pool,
		amount: input.amount,
		...(input.source === undefined ? {} : { source: input.source }),
	};
	for (const hook of byPriority(catalog.rules.healHooks)) {
		proposal = hook.apply(proposal, {
			state: widen(state),
			catalog,
		});
	}
	const target = unitOf(state, proposal.target);
	for (const entry of target.statuses) {
		const gate = catalog.statusDef(entry.status).healGate;
		if (gate && !proposal.tags.some((tag) => gate.allowTags.includes(tag))) {
			return recordEvent(
				state,
				"cura.bloqueada",
				{
					target: proposal.target,
					tags: proposal.tags,
					amount: proposal.amount,
					by: entry.status,
					...(proposal.source === undefined ? {} : { source: proposal.source }),
				},
				meta,
			);
		}
	}
	const max = poolMax(state, catalog, proposal.target, proposal.pool);
	const stored = target.pools[proposal.pool] ?? 0;
	const credited = Math.max(
		0,
		Math.min(max, stored + proposal.amount) - stored,
	);
	const current = setPool(
		state,
		proposal.target,
		proposal.pool,
		stored + credited,
	);
	return recordEvent(
		current,
		"cura.aplicada",
		{
			target: proposal.target,
			pool: proposal.pool,
			tags: proposal.tags,
			requested: proposal.amount,
			amount: credited,
			...(proposal.source === undefined ? {} : { source: proposal.source }),
		},
		meta,
	);
}

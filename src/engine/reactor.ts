import { abilitiesOf, testCondition } from "./attributes";
import { runWithChoices } from "./choice";
import { type EngineEvent, nextSeq } from "./events";
import type { KindNode, KindRegistry } from "./kinds";
import type { ScopeRegistry } from "./scopes";
import { type StackEntry, orderEntries, pushEntry } from "./stack";
import {
	addToCounter,
	counterOf,
	type EngineEventMap,
	type EngineState,
	type GameState,
} from "./state";
import { expireScope, tickCooldowns, tickStatuses } from "./statuses";
import { endTurn, startTurns, activePlayer } from "./turns";
import type { UnitCtx } from "./unitKinds";
import {
	bindNodes,
	DEFAULT_MAX_REACTIONS,
	limitRef,
	type UnitCatalog,
	type UnitId,
	unitOf,
	unitsOf,
} from "./units";

export interface Reaction {
	readonly key: string;
	readonly priority: number;
	readonly nodes: readonly KindNode[];
}

interface ReactionEffect {
	readonly nodes: readonly KindNode[];
	readonly cause: number;
}

type Payload = Readonly<Record<string, unknown>>;

function sortBy<T>(list: T[], keys: (item: T) => (string | number)[]): T[] {
	return list.sort((a, b) => {
		const left = keys(a);
		const right = keys(b);
		for (let i = 0; i < left.length; i++) {
			if (left[i] < right[i]) return -1;
			if (left[i] > right[i]) return 1;
		}
		return 0;
	});
}

export function reactionsFor<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	event: EngineEvent<TMap>,
): { state: EngineState<TMap>; reactions: readonly Reaction[] } {
	const payload = event.payload as Payload;
	const subject = (payload.unit ?? payload.target) as UnitId | undefined;
	let current = state;
	const own: (Reaction & { unit: string; ability: string })[] = [];
	for (const unit of unitsOf(state)) {
		for (const ref of abilitiesOf(state, catalog, unit.id)) {
			const { def } = ref;
			if (def.activation !== "triggered" || def.on?.event !== event.type) {
				continue;
			}
			const scope = def.on.scope ?? "any";
			if (scope === "controller" && payload.player !== unit.controller)
				continue;
			if (scope === "unit" && subject !== unit.id) continue;
			if (
				def.condition &&
				!testCondition(current, catalog, unit.id, def.condition)
			) {
				continue;
			}
			const counter = limitRef(unit.id, def);
			if (counter && def.limit) {
				if (counterOf(current, counter) >= def.limit.times) continue;
				current = addToCounter(current, counter, 1, { cause: event.seq });
			}
			own.push({
				key: `${unit.id}:${def.id}`,
				unit: unit.id,
				ability: def.id,
				priority: def.priority ?? 0,
				nodes: bindNodes(def.effects, {
					self: unit.id,
					target: subject ?? unit.id,
				}),
			});
		}
	}
	const reactions: Reaction[] = sortBy(own, (r) => [
		r.priority,
		r.unit,
		r.ability,
	]);

	const aura = (
		area: UnitId,
		who: UnitId,
		field: "onEnter" | "onLeave" | "onTurnStart",
	) => {
		if (current.units?.[area] === undefined) return;
		const def = catalog.unitDef(unitOf(current, area).def).aura;
		const nodes = def?.[field];
		if (!def || !nodes?.length) return;
		if (def.filter && !testCondition(current, catalog, who, def.filter)) return;
		reactions.push({
			key: `${area}:aura.${field}`,
			priority: 0,
			nodes: bindNodes(nodes, { self: area, area, target: who }),
		});
	};
	if (event.type === "area.entrou") {
		aura(payload.area as UnitId, payload.unit as UnitId, "onEnter");
	} else if (event.type === "area.saiu") {
		aura(payload.area as UnitId, payload.unit as UnitId, "onLeave");
	} else if (event.type === "turno.iniciado") {
		for (const area of unitsOf(current)) {
			for (const member of unitsOf(current)) {
				if (
					member.presentIn.includes(area.id) &&
					member.controller === payload.player
				) {
					aura(area.id, member.id, "onTurnStart");
				}
			}
		}
	}
	return { state: current, reactions };
}

function drain<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
): GameState<TGame, TMap> {
	let current = state;
	for (;;) {
		const { pending } = current.engine.stack;
		const entry = orderEntries(pending, "fifo")[0] as
			| StackEntry<ReactionEffect>
			| undefined;
		if (!entry) return current;
		current = {
			...current,
			engine: {
				...current.engine,
				stack: {
					pending: pending.filter((candidate) => candidate !== entry),
					resolving: entry,
				},
			},
		};
		current = runWithChoices(registry, current, [...entry.effect.nodes], {
			cause: entry.effect.cause,
			units: catalog,
		});
		current = {
			...current,
			engine: {
				...current.engine,
				stack: { ...current.engine.stack, resolving: null },
			},
		};
		if (current.engine.pending) return current;
	}
}

export function settle<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
	since: number,
): GameState<TGame, TMap> {
	const limit = catalog.rules.maxReactions ?? DEFAULT_MAX_REACTIONS;
	let current = drain(registry, state, catalog);
	let cursor = since;
	let fired = 0;
	while (!current.engine.pending) {
		const events = current.engine.events.filter((event) => event.seq >= cursor);
		cursor = nextSeq(current.engine.events);
		let engine = current.engine;
		let stack = engine.stack;
		let count = 0;
		for (const event of events) {
			const found = reactionsFor(engine, catalog, event);
			engine = found.state;
			for (const reaction of found.reactions) {
				stack = pushEntry(stack, {
					cause: event.type,
					source: reaction.key,
					effect: {
						nodes: reaction.nodes,
						cause: event.seq,
					} satisfies ReactionEffect,
				});
				count++;
			}
		}
		if (count === 0) return { ...current, engine };
		fired += count;
		if (fired > limit) {
			throw new Error(`Reações encadeadas excederam o limite de ${limit}`);
		}
		current = drain(
			registry,
			{ ...current, engine: { ...engine, stack } },
			catalog,
		);
	}
	return current;
}

export function runReactive<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
	nodes: readonly KindNode[],
	ctx: { readonly cause?: number } = {},
): GameState<TGame, TMap> {
	const since = nextSeq(state.engine.events);
	const ran = runWithChoices(registry, state, nodes, {
		cause: ctx.cause,
		units: catalog,
	});
	return ran.engine.pending ? ran : settle(registry, ran, catalog, since);
}

function eventsSince<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	since: number,
) {
	return state.events.filter((event) => event.seq >= since);
}

function beginTurnOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
): EngineState<TMap> {
	const player = activePlayer(state);
	return tickStatuses(
		tickCooldowns(state, catalog, player, "start"),
		catalog,
		player,
		"start",
	);
}

export function startUnitTurns<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
): GameState<TGame, TMap> {
	const since = nextSeq(state.engine.events);
	const engine = beginTurnOf(startTurns(state.engine), catalog);
	return settle(registry, { ...state, engine }, catalog, since);
}

export interface ClosedTurn<TGame, TMap extends EngineEventMap> {
	readonly state: GameState<TGame, TMap>;
	readonly since: number;
}

export function closeUnitTurn<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
	scopes: ScopeRegistry,
): ClosedTurn<TGame, TMap> {
	const since = nextSeq(state.engine.events);
	const player = activePlayer(state.engine);
	let engine = tickCooldowns(state.engine, catalog, player, "end");
	engine = tickStatuses(engine, catalog, player, "end");
	const mark = nextSeq(engine.events);
	engine = endTurn(engine, scopes);
	for (const event of eventsSince(engine, mark)) {
		if (event.type === "escopo.encerrado") {
			const ended = (event.payload as { scope: string }).scope;
			engine = expireScope(engine, catalog, scopes, ended);
		}
	}
	return { state: { ...state, engine }, since };
}

export function openUnitTurn<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	closed: ClosedTurn<TGame, TMap>,
	catalog: UnitCatalog,
): GameState<TGame, TMap> {
	const engine = beginTurnOf(closed.state.engine, catalog);
	return settle(registry, { ...closed.state, engine }, catalog, closed.since);
}

export function endUnitTurn<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
	scopes: ScopeRegistry,
): GameState<TGame, TMap> {
	return openUnitTurn(registry, closeUnitTurn(state, catalog, scopes), catalog);
}

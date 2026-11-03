import { seededDice, type SeededDice } from "../../engine/dice";
import {
	addCard,
	counterKey,
	counterOf,
	createEngineState,
	type EngineState,
	moveCard,
	removeCard,
	reorderZone,
	shuffleZone,
	type ZoneInit,
} from "../../engine/state";
import type { RngState } from "../ports/random";

export const DECK_ZONES = {
	dungeonDeck: "dungeon",
	enemyDeck: "enemy",
	itemDeck: "item",
	artifactDeck: "artifact",
} as const;

export type DeckName = keyof typeof DECK_ZONES;
export const DECK_NAMES = Object.keys(DECK_ZONES) as readonly DeckName[];

export const PILES = ["available", "discarded", "removed"] as const;
export type Pile = (typeof PILES)[number];

export interface DeckPiles {
	readonly available: readonly string[];
	readonly discarded: readonly string[];
	readonly removed: readonly string[];
}

export type DeckSet = Readonly<Record<DeckName, DeckPiles>>;

export const EMPTY_PILES: DeckPiles = {
	available: [],
	discarded: [],
	removed: [],
};

const PILE_VISIBILITY = {
	available: "hidden",
	discarded: "public",
	removed: "count",
} as const;

export function zoneName(deck: DeckName, pile: Pile): string {
	return `${DECK_ZONES[deck]}.${pile}`;
}

export function createDeckEngine(): EngineState {
	const zones: ZoneInit[] = DECK_NAMES.flatMap((deck) =>
		PILES.map((pile) => ({
			id: zoneName(deck, pile),
			visibility: PILE_VISIBILITY[pile],
			ordered: true,
		})),
	);
	return createEngineState({ dice: seededDice(0), zones });
}

const defIdCache = new WeakMap<readonly string[], readonly string[]>();

function defIdsOf(engine: EngineState, zone: string): readonly string[] {
	const ids = engine.zones[zone].cards;
	let defs = defIdCache.get(ids);
	if (!defs) {
		defs = ids.map((id) => engine.cards[id].defId);
		defIdCache.set(ids, defs);
	}
	return defs;
}

export function readPiles(engine: EngineState, deck: DeckName): DeckPiles {
	return {
		available: defIdsOf(engine, zoneName(deck, "available")),
		discarded: defIdsOf(engine, zoneName(deck, "discarded")),
		removed: defIdsOf(engine, zoneName(deck, "removed")),
	};
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((value, i) => value === b[i]);
}

function newInstanceId(
	engine: EngineState,
	defId: string,
): { id: string; engine: EngineState } {
	const key = counterKey({ scope: "instancia", id: defId, name: "seq" });
	const seq = counterOf(engine, { scope: "instancia", id: defId, name: "seq" });
	return {
		id: `${defId}#${seq}`,
		engine: { ...engine, counters: { ...engine.counters, [key]: seq + 1 } },
	};
}

export function writePiles(
	engine: EngineState,
	deck: DeckName,
	piles: DeckPiles,
): EngineState {
	const zones = PILES.map((pile) => zoneName(deck, pile));
	if (PILES.every((pile, i) => sameList(defIdsOf(engine, zones[i]), piles[pile]))) {
		return engine;
	}
	const where = new Map<string, string>();
	const inZone = new Map<string, string[]>();
	const anywhere = new Map<string, string[]>();
	const push = (map: Map<string, string[]>, key: string, id: string) => {
		const list = map.get(key);
		if (list) list.push(id);
		else map.set(key, [id]);
	};
	zones.forEach((zone) => {
		for (const id of engine.zones[zone].cards) {
			const defId = engine.cards[id].defId;
			where.set(id, zone);
			push(inZone, `${zone}|${defId}`, id);
			push(anywhere, defId, id);
		}
	});
	const claimed = new Set<string>();
	const take = (list: string[] | undefined): string | undefined => {
		while (list?.length) {
			const id = list.shift() as string;
			if (!claimed.has(id)) {
				claimed.add(id);
				return id;
			}
		}
		return undefined;
	};

	let next = engine;
	const orders: string[][] = [];
	PILES.forEach((pile, i) => {
		const order: string[] = [];
		for (const defId of piles[pile]) {
			let id =
				take(inZone.get(`${zones[i]}|${defId}`)) ?? take(anywhere.get(defId));
			if (id === undefined) {
				const created = newInstanceId(next, defId);
				id = created.id;
				next = addCard(created.engine, { id, defId }, zones[i]);
				claimed.add(id);
				where.set(id, zones[i]);
			} else if (where.get(id) !== zones[i]) {
				next = moveCard(next, id, where.get(id) as string, zones[i]);
				where.set(id, zones[i]);
			}
			order.push(id);
		}
		orders.push(order);
	});
	for (const id of where.keys()) {
		if (!claimed.has(id)) next = removeCard(next, id);
	}
	zones.forEach((zone, i) => {
		next = reorderZone(next, zone, orders[i]);
	});
	return { ...next, events: engine.events };
}

export function shuffleDeckZone(
	engine: EngineState,
	rng: RngState,
	deck: DeckName,
	pile: Pile,
): { engine: EngineState; rng: RngState } {
	const dice: SeededDice = {
		kind: "seeded",
		seed: rng.seed,
		counter: rng.counter,
	};
	const shuffled = shuffleZone({ ...engine, dice }, zoneName(deck, pile));
	const used = shuffled.dice as SeededDice;
	return {
		engine: { ...shuffled, dice: engine.dice, events: engine.events },
		rng: { seed: used.seed, counter: used.counter },
	};
}

export function moveDeckCards(
	engine: EngineState,
	deck: DeckName,
	from: Pile,
	to: Pile,
	count: number,
): EngineState {
	let next = engine;
	const source = zoneName(deck, from);
	const moving = engine.zones[source].cards.slice(0, count);
	for (const id of moving) next = moveCard(next, id, source, zoneName(deck, to));
	return { ...next, events: engine.events };
}

export function zoneViolation(engine: EngineState): string | null {
	const seen = new Map<string, string>();
	for (const zone of Object.values(engine.zones)) {
		for (const id of zone.cards) {
			if (!engine.cards[id]) {
				return `zona "${zone.id}" cita instância inexistente "${id}"`;
			}
			const other = seen.get(id);
			if (other !== undefined) {
				return `instância "${id}" em mais de uma zona ("${other}" e "${zone.id}")`;
			}
			seen.set(id, zone.id);
		}
	}
	for (const id of Object.keys(engine.cards)) {
		if (!seen.has(id)) return `instância "${id}" fora de qualquer zona`;
	}
	return null;
}

export function dealDecks(
	rng: RngState,
	lists: Readonly<Record<DeckName, readonly string[]>>,
): { engine: EngineState; rng: RngState } {
	let engine = createDeckEngine();
	for (const deck of DECK_NAMES) {
		engine = writePiles(engine, deck, { ...EMPTY_PILES, available: lists[deck] });
	}
	let next = rng;
	for (const deck of DECK_NAMES) {
		({ engine, rng: next } = shuffleDeckZone(engine, next, deck, "available"));
	}
	return { engine, rng: next };
}

export function reshuffleDiscard(
	engine: EngineState,
	rng: RngState,
	deck: DeckName,
): { engine: EngineState; rng: RngState } {
	const moved = moveDeckCards(
		engine,
		deck,
		"discarded",
		"available",
		engine.zones[zoneName(deck, "discarded")].cards.length,
	);
	return shuffleDeckZone(moved, rng, deck, "available");
}

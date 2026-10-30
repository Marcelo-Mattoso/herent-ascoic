import { type Dice, roll, shuffleWith } from "./dice";
import {
	appendEvent,
	type EngineEvent,
	type EventMeta,
	type PlayerId,
} from "./events";
import type { PendingResolution } from "./choice";
import { EMPTY_STACK, type EngineStack } from "./stack";
import { NO_TURNS, type TurnState } from "./turn";
import type { ResponseWindow } from "./windows";

export type CardInstanceId = string;
export type ZoneVisibility = "public" | "owner" | "hidden" | "count";

export interface CardInstance {
	readonly id: CardInstanceId;
	readonly defId: string;
	readonly owner?: PlayerId;
	readonly controller?: PlayerId;
}

export interface Zone {
	readonly id: string;
	readonly owner?: PlayerId;
	readonly visibility: ZoneVisibility;
	readonly ordered: boolean;
	readonly cards: readonly CardInstanceId[];
}

export interface CounterRef {
	readonly scope: string;
	readonly id: string;
	readonly name: string;
}

export type EngineEventMap = {
	"carta.movida": { card: CardInstanceId; from: string; to: string };
	"dado.rolado": { faces: number; value: number };
	"zona.embaralhada": { zone: string };
	"contador.alterado": { counter: CounterRef; delta: number; value: number };
	"controle.alterado": { card: CardInstanceId; from?: PlayerId; to: PlayerId };
	"turno.iniciado": { player: PlayerId; turn: number; round: number };
	"turno.encerrado": { player: PlayerId; turn: number; round: number };
	"etapa.iniciada": { phase: string; player: PlayerId; turn: number };
	"escopo.encerrado": { scope: string; cleared: number };
	"escolha.aberta": { choice: string; player: PlayerId };
	"escolha.respondida": {
		choice: string;
		player: PlayerId;
		picks: readonly string[];
	};
	"janela.aberta": {
		window: string;
		cause: string;
		order: "fifo" | "lifo";
		holder: PlayerId;
	};
	"janela.resposta": { window: string; player: PlayerId; item: string };
	"janela.passe": { window: string; player: PlayerId };
	"janela.resolvida": {
		window: string;
		resolved: number;
		order: "fifo" | "lifo";
	};
	"alvo.ilegal": {
		selector: string;
		caster: PlayerId;
		targets: readonly string[];
		reason: string;
	};
};

export interface EngineState<TMap extends EngineEventMap = EngineEventMap> {
	readonly players: readonly PlayerId[];
	readonly cards: Readonly<Record<CardInstanceId, CardInstance>>;
	readonly zones: Readonly<Record<string, Zone>>;
	readonly counters: Readonly<Record<string, number>>;
	readonly dice: Dice;
	readonly turn: TurnState;
	readonly pending?: PendingResolution;
	readonly window?: ResponseWindow;
	readonly stack: EngineStack;
	readonly events: readonly EngineEvent<TMap>[];
}

export interface GameState<
	TGame,
	TMap extends EngineEventMap = EngineEventMap,
> {
	readonly engine: EngineState<TMap>;
	readonly game: TGame;
}

export type DrawPolicy =
	| { readonly onEmpty: "error" }
	| { readonly onEmpty: "stop" }
	| { readonly onEmpty: "reshuffle-from"; readonly source: string };

export interface ZoneInit {
	readonly id: string;
	readonly owner?: PlayerId;
	readonly visibility?: ZoneVisibility;
	readonly ordered?: boolean;
	readonly cards?: readonly CardInstanceId[];
}

export function engineOf<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
): EngineState<TMap> {
	return state.engine;
}

export function gameOf<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
): TGame {
	return state.game;
}

export function withEngine<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
	update: (engine: EngineState<TMap>) => EngineState<TMap>,
): GameState<TGame, TMap> {
	return { ...state, engine: update(state.engine) };
}

export function withGame<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
	update: (game: TGame) => TGame,
): GameState<TGame, TMap> {
	return { ...state, game: update(state.game) };
}

export function counterKey(ref: CounterRef): string {
	return `${ref.scope}:${ref.id}:${ref.name}`;
}

export function createEngineState<
	TMap extends EngineEventMap = EngineEventMap,
>(init: {
	dice: Dice;
	players?: readonly PlayerId[];
	cards?: readonly CardInstance[];
	zones?: readonly ZoneInit[];
	counters?: readonly (CounterRef & { readonly value: number })[];
}): EngineState<TMap> {
	const cards: Record<CardInstanceId, CardInstance> = {};
	for (const card of init.cards ?? []) {
		if (cards[card.id]) throw new Error(`Instância duplicada: "${card.id}"`);
		cards[card.id] = card;
	}
	const zones: Record<string, Zone> = {};
	const placed = new Set<CardInstanceId>();
	for (const zone of init.zones ?? []) {
		if (zones[zone.id]) throw new Error(`Zona duplicada: "${zone.id}"`);
		for (const card of zone.cards ?? []) {
			if (!cards[card]) {
				throw new Error(
					`Zona "${zone.id}" cita instância inexistente "${card}"`,
				);
			}
			if (placed.has(card)) {
				throw new Error(`Instância "${card}" está em mais de uma zona`);
			}
			placed.add(card);
		}
		zones[zone.id] = {
			id: zone.id,
			owner: zone.owner,
			visibility: zone.visibility ?? "public",
			ordered: zone.ordered ?? true,
			cards: zone.cards ?? [],
		};
	}
	const counters: Record<string, number> = {};
	for (const { value, ...ref } of init.counters ?? []) {
		counters[counterKey(ref)] = value;
	}
	return {
		players: init.players ?? [],
		cards,
		zones,
		counters,
		dice: init.dice,
		turn: NO_TURNS,
		stack: EMPTY_STACK,
		events: [],
	};
}

export function recordEvent<
	TMap extends EngineEventMap,
	K extends keyof EngineEventMap,
>(
	state: EngineState<TMap>,
	type: K,
	payload: EngineEventMap[K],
	meta?: EventMeta,
): EngineState<TMap> {
	const events = appendEvent(
		state.events as readonly EngineEvent<EngineEventMap>[],
		type,
		payload,
		meta,
	) as readonly EngineEvent<TMap>[];
	return { ...state, events };
}

export function zoneOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	zone: string,
): Zone {
	const found = state.zones[zone];
	if (!found) throw new Error(`Zona desconhecida: "${zone}"`);
	return found;
}

export function cardsOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	zone: string,
): readonly CardInstanceId[] {
	return zoneOf(state, zone).cards;
}

export function instanceOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
): CardInstance {
	const found = state.cards[card];
	if (!found) throw new Error(`Instância desconhecida: "${card}"`);
	return found;
}

function withCards<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	zone: string,
	cards: readonly CardInstanceId[],
): EngineState<TMap> {
	const current = zoneOf(state, zone);
	return {
		...state,
		zones: { ...state.zones, [zone]: { ...current, cards } },
	};
}

export function moveCard<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
	from: string,
	to: string,
	meta?: EventMeta,
): EngineState<TMap> {
	instanceOf(state, card);
	const source = cardsOf(state, from);
	const index = source.indexOf(card);
	if (index < 0) throw new Error(`Carta "${card}" não está na zona "${from}"`);
	const target = cardsOf(state, to);
	const moved =
		from === to
			? state
			: withCards(
					withCards(
						state,
						from,
						source.filter((_, i) => i !== index),
					),
					to,
					[...target, card],
				);
	return recordEvent(moved, "carta.movida", { card, from, to }, meta);
}

export function shuffleZone<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	zone: string,
	meta?: EventMeta,
): EngineState<TMap> {
	const { items, next } = shuffleWith(state.dice, cardsOf(state, zone));
	const shuffled = { ...withCards(state, zone, items), dice: next };
	return recordEvent(shuffled, "zona.embaralhada", { zone }, meta);
}

export function drawCards<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	from: string,
	to: string,
	count: number,
	policy: DrawPolicy = { onEmpty: "error" },
): EngineState<TMap> {
	let current = state;
	for (let i = 0; i < count; i++) {
		if (cardsOf(current, from).length === 0) {
			if (policy.onEmpty === "reshuffle-from") {
				for (const card of cardsOf(current, policy.source)) {
					current = moveCard(current, card, policy.source, from);
				}
				if (cardsOf(current, from).length > 0) {
					current = shuffleZone(current, from);
				}
			}
			if (cardsOf(current, from).length === 0) {
				if (policy.onEmpty === "error") {
					throw new Error(`Zona "${from}" vazia ao comprar`);
				}
				return current;
			}
		}
		current = moveCard(current, cardsOf(current, from)[0], from, to);
	}
	return current;
}

export function rollInto<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	faces: number,
	meta?: EventMeta,
): { state: EngineState<TMap>; value: number } {
	const { value, next } = roll(state.dice, faces);
	return {
		state: recordEvent(
			{ ...state, dice: next },
			"dado.rolado",
			{ faces, value },
			meta,
		),
		value,
	};
}

export function controllerOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
): PlayerId | undefined {
	const instance = instanceOf(state, card);
	if (instance.controller !== undefined) return instance.controller;
	if (instance.owner !== undefined) return instance.owner;
	for (const zone of Object.values(state.zones)) {
		if (zone.cards.includes(card)) return zone.owner;
	}
	return undefined;
}

export function setController<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
	player: PlayerId,
	meta?: EventMeta,
): EngineState<TMap> {
	if (!state.players.includes(player)) {
		throw new Error(`Jogador desconhecido: "${player}"`);
	}
	const from = controllerOf(state, card);
	const updated = {
		...state,
		cards: {
			...state.cards,
			[card]: { ...instanceOf(state, card), controller: player },
		},
	};
	return recordEvent(
		updated,
		"controle.alterado",
		{ card, from, to: player },
		meta,
	);
}

export function counterOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	counter: CounterRef,
): number {
	return state.counters[counterKey(counter)] ?? 0;
}

export function addToCounter<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	counter: CounterRef,
	delta: number,
	meta?: EventMeta,
): EngineState<TMap> {
	const value = counterOf(state, counter) + delta;
	const updated = {
		...state,
		counters: { ...state.counters, [counterKey(counter)]: value },
	};
	return recordEvent(
		updated,
		"contador.alterado",
		{ counter, delta, value },
		meta,
	);
}

export function addCard<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	instance: CardInstance,
	zone: string,
): EngineState<TMap> {
	if (state.cards[instance.id]) {
		throw new Error(`Instância duplicada: "${instance.id}"`);
	}
	const target = cardsOf(state, zone);
	return withCards(
		{ ...state, cards: { ...state.cards, [instance.id]: instance } },
		zone,
		[...target, instance.id],
	);
}

export function removeCard<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
): EngineState<TMap> {
	instanceOf(state, card);
	const { [card]: _removed, ...cards } = state.cards;
	const zones = Object.fromEntries(
		Object.entries(state.zones).map(([id, zone]) => [
			id,
			zone.cards.includes(card)
				? { ...zone, cards: zone.cards.filter((entry) => entry !== card) }
				: zone,
		]),
	);
	return { ...state, cards, zones };
}

export function reorderZone<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	zone: string,
	order: readonly CardInstanceId[],
): EngineState<TMap> {
	const current = cardsOf(state, zone);
	const sorted = (list: readonly CardInstanceId[]) => [...list].sort().join("\n");
	if (order.length !== current.length || sorted(order) !== sorted(current)) {
		throw new Error(`Nova ordem de "${zone}" não é permutação do conteúdo`);
	}
	return withCards(state, zone, order);
}

export function zoneHolding<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	card: CardInstanceId,
): string | undefined {
	return Object.values(state.zones).find((zone) => zone.cards.includes(card))
		?.id;
}

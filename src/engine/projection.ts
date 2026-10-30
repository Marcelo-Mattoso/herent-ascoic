import type { PendingChoice } from "./choice";
import type { EngineEvent, PlayerId } from "./events";
import type {
	CardInstance,
	CardInstanceId,
	EngineEventMap,
	EngineState,
	Zone,
	ZoneVisibility,
} from "./state";
import type { TurnState } from "./turn";

export interface ProjectedZone {
	readonly id: string;
	readonly owner?: PlayerId;
	readonly visibility: ZoneVisibility;
	readonly count: number | null;
	readonly cards: readonly CardInstance[] | null;
}

export interface ProjectedChoice {
	readonly id: string;
	readonly player: PlayerId;
	readonly options: readonly string[] | null;
	readonly min: number;
	readonly max: number;
	readonly data?: unknown;
}

export interface ProjectedEngine<TMap extends EngineEventMap = EngineEventMap> {
	readonly viewer: PlayerId;
	readonly players: readonly PlayerId[];
	readonly turn: TurnState;
	readonly zones: Readonly<Record<string, ProjectedZone>>;
	readonly cards: Readonly<Record<CardInstanceId, CardInstance>>;
	readonly counters: Readonly<Record<string, number>>;
	readonly pending?: ProjectedChoice;
	readonly events: readonly EngineEvent<TMap>[];
}

export interface ProjectOptions {
	zoneVisibility?(zone: Zone, viewer: PlayerId): ZoneVisibility;
	counterVisible?(key: string, viewer: PlayerId): boolean;
}

const HIDDEN_CARD = "?";

export function zoneAccess(
	zone: Zone,
	viewer: PlayerId,
	visibility: ZoneVisibility = zone.visibility,
): { readonly cards: boolean; readonly count: boolean } {
	switch (visibility) {
		case "public":
			return { cards: true, count: true };
		case "owner":
			return { cards: zone.owner === viewer, count: true };
		case "count":
			return { cards: false, count: true };
		case "hidden":
			return { cards: false, count: zone.owner === viewer };
	}
}

function visibleToViewer(
	event: { readonly visibleTo?: "all" | readonly PlayerId[] },
	viewer: PlayerId,
): boolean {
	return (
		event.visibleTo === undefined ||
		event.visibleTo === "all" ||
		event.visibleTo.includes(viewer)
	);
}

function redactMove<TMap extends EngineEventMap>(
	event: EngineEvent<TMap>,
	canSeeCard: (card: CardInstanceId) => boolean,
): EngineEvent<TMap> {
	if (event.type !== "carta.movida") return event;
	const payload = event.payload as { card: CardInstanceId };
	if (canSeeCard(payload.card)) return event;
	return {
		...event,
		payload: { ...payload, card: HIDDEN_CARD },
	} as EngineEvent<TMap>;
}

export function project<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	viewer: PlayerId,
	options: ProjectOptions = {},
): ProjectedEngine<TMap> {
	const zones: Record<string, ProjectedZone> = {};
	const cards: Record<CardInstanceId, CardInstance> = {};
	const seen = new Set<CardInstanceId>();
	const visibilityOf = (zone: Zone) =>
		options.zoneVisibility?.(zone, viewer) ?? zone.visibility;

	for (const zone of Object.values(state.zones)) {
		const visibility = visibilityOf(zone);
		const access = zoneAccess(zone, viewer, visibility);
		const visible = access.cards
			? zone.cards.map((id) => state.cards[id]).filter((c) => c !== undefined)
			: null;
		if (visible) {
			for (const card of visible) {
				cards[card.id] = card;
				seen.add(card.id);
			}
		}
		zones[zone.id] = {
			id: zone.id,
			...(zone.owner === undefined ? {} : { owner: zone.owner }),
			visibility,
			count: access.count ? zone.cards.length : null,
			cards: visible,
		};
	}

	const events = state.events
		.filter((event) => visibleToViewer(event, viewer))
		.map((event) => redactMove(event, (card) => seen.has(card)));

	const counters = options.counterVisible
		? Object.fromEntries(
				Object.entries(state.counters).filter(([key]) =>
					options.counterVisible?.(key, viewer),
				),
			)
		: state.counters;

	const pending = state.pending
		? projectChoice(state.pending.choice, viewer)
		: undefined;

	return {
		viewer,
		players: state.players,
		turn: state.turn,
		zones,
		cards,
		counters,
		...(pending ? { pending } : {}),
		events,
	};
}

function projectChoice(choice: PendingChoice, viewer: PlayerId): ProjectedChoice {
	const decides = choice.player === viewer;
	return {
		id: choice.id,
		player: choice.player,
		options: decides ? choice.options : null,
		min: choice.min,
		max: choice.max,
		...(decides && choice.data !== undefined ? { data: choice.data } : {}),
	};
}

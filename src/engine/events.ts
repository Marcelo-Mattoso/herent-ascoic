export type PlayerId = string;

export type EventVisibility = "all" | readonly PlayerId[];

export interface EventMeta {
	readonly cause?: number;
	readonly actor?: PlayerId;
	readonly visibleTo?: EventVisibility;
}

export type EngineEvent<
	TMap extends Record<string, unknown> = Record<string, unknown>,
> = {
	[K in keyof TMap & string]: {
		readonly seq: number;
		readonly type: K;
		readonly payload: TMap[K];
	} & EventMeta;
}[keyof TMap & string];

export type EngineEventDraft<
	TMap extends Record<string, unknown> = Record<string, unknown>,
> = {
	[K in keyof TMap & string]: {
		readonly type: K;
		readonly payload: TMap[K];
	} & EventMeta;
}[keyof TMap & string];

export type EventOfType<
	TEvent extends { readonly type: string },
	K extends TEvent["type"],
> = Extract<TEvent, { readonly type: K }>;

export function nextSeq(events: readonly { readonly seq: number }[]): number {
	const last = events.at(-1);
	return last === undefined ? 0 : last.seq + 1;
}

export function stampEvent<TMap extends Record<string, unknown>>(
	events: readonly EngineEvent<TMap>[],
	draft: EngineEventDraft<TMap>,
): readonly EngineEvent<TMap>[] {
	return [...events, { ...draft, seq: nextSeq(events) } as EngineEvent<TMap>];
}

export function appendEvent<
	TMap extends Record<string, unknown>,
	K extends keyof TMap & string,
>(
	events: readonly EngineEvent<TMap>[],
	type: K,
	payload: TMap[K],
	meta: EventMeta = {},
): readonly EngineEvent<TMap>[] {
	const defined = Object.fromEntries(
		Object.entries(meta).filter(([, value]) => value !== undefined),
	);
	return stampEvent(events, {
		...defined,
		type,
		payload,
	} as EngineEventDraft<TMap>);
}

export function eventsOfType<
	TEvent extends { readonly type: string },
	K extends TEvent["type"],
>(events: readonly TEvent[], type: K): readonly EventOfType<TEvent, K>[] {
	return events.filter(
		(event): event is EventOfType<TEvent, K> => event.type === type,
	);
}

export function lastEventOfType<
	TEvent extends { readonly type: string },
	K extends TEvent["type"],
>(events: readonly TEvent[], type: K): EventOfType<TEvent, K> | undefined {
	return eventsOfType(events, type).at(-1);
}

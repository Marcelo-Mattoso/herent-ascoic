import type { Dice } from "./dice";
import type { KindNode, KindRegistry } from "./kinds";
import type { ScopeRegistry } from "./scopes";

export interface SourceRef {
	readonly kind: string;
	readonly id: string;
	readonly owner?: string;
}

export interface ContentPort<TCard, TAbility> {
	card(id: string): TCard;
	hasCard(id: string): boolean;
	cards(): readonly TCard[];
	abilitiesOf(cardId: string): readonly { def: TAbility; ref: unknown }[];
	ability(id: string): TAbility;
	hasAbility(id: string): boolean;
	text(key: string, params?: Record<string, unknown>): string;
}

export interface RequirementPort<S> {
	met(
		state: S,
		req: { kind: string; [k: string]: unknown },
		src: SourceRef,
	): boolean;
}

export interface ScopePort<S> {
	registry: ScopeRegistry;
	key(state: S, scope: string, src: SourceRef): string;
}

export interface Ruleset<TBalance, TTransitions> {
	id: string;
	version: string;
	balance: TBalance;
	transitions: TTransitions;
	eventRules: unknown;
}

export interface EngineConfig<
	S,
	TCard,
	TAbility,
	TBal,
	TTr,
	TContent extends ContentPort<TCard, TAbility> = ContentPort<TCard, TAbility>,
	TKinds extends KindRegistry<S, never, never> = KindRegistry<S, never, never>,
	TFlow = undefined,
> {
	ruleset: Ruleset<TBal, TTr>;
	content: TContent;
	kinds: TKinds;
	nodesOf?: (ability: TAbility) => readonly KindNode[];
	dice: (seed: number) => Dice;
	requirements: RequirementPort<S>;
	scopes: ScopePort<S>;
	flow?: TFlow;
}

export interface Engine<
	S,
	TCard,
	TAbility,
	TBal,
	TTr,
	TContent extends ContentPort<TCard, TAbility> = ContentPort<TCard, TAbility>,
	TKinds extends KindRegistry<S, never, never> = KindRegistry<S, never, never>,
	TFlow = undefined,
> {
	readonly ruleset: Readonly<Ruleset<TBal, TTr>>;
	readonly content: TContent;
	readonly kinds: TKinds;
	readonly dice: (seed: number) => Dice;
	readonly requirements: RequirementPort<S>;
	readonly scopes: ScopePort<S>;
	readonly flow: TFlow;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (typeof value !== "object" || value === null) return value;
	if (seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value)) deepFreeze(child, seen);
	return Object.freeze(value);
}

function fail(message: string): never {
	throw new Error(`createEngine: ${message}`);
}

export function createEngine<
	S,
	TCard,
	TAbility,
	TBal,
	TTr,
	TContent extends ContentPort<TCard, TAbility> = ContentPort<TCard, TAbility>,
	TKinds extends KindRegistry<S, never, never> = KindRegistry<S, never, never>,
	TFlow = undefined,
>(
	cfg: EngineConfig<S, TCard, TAbility, TBal, TTr, TContent, TKinds, TFlow>,
): Engine<S, TCard, TAbility, TBal, TTr, TContent, TKinds, TFlow> {
	const { ruleset, content } = cfg;
	if (!ruleset.id) fail("ruleset.id vazio");
	if (!ruleset.version) fail("ruleset.version vazio");
	if (typeof cfg.dice !== "function") fail("dice deve ser uma função");
	if (cfg.scopes.registry.ids().length === 0) fail("scopes vazio");
	if (typeof cfg.kinds?.validateAll !== "function") {
		fail("kinds deve ser um registro de kinds");
	}

	const all = content.cards();
	const ids = new Set<string>();
	const abilitiesByCard = new Map<
		string,
		readonly { def: TAbility; ref: unknown }[]
	>();
	for (const card of all) {
		const id = (card as { id?: unknown }).id;
		if (typeof id !== "string" || id === "") fail("carta sem id");
		if (ids.has(id)) fail(`id de carta duplicado: ${id}`);
		ids.add(id);
		try {
			const abilities = content.abilitiesOf(id);
			if (cfg.nodesOf) {
				for (const { def } of abilities) {
					cfg.kinds.validateAll(
						cfg.nodesOf(def),
						`carta ${id} > habilidade ${(def as { id?: string }).id ?? "?"}`,
					);
				}
			}
			abilitiesByCard.set(id, deepFreeze(abilities));
		} catch (error) {
			fail(
				`habilidades da carta ${id} inválidas: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const cardsById = new Map<string, TCard>(
		all.map((card) => [(card as { id: string }).id, card]),
	);
	const cardsList: readonly TCard[] = deepFreeze([...all]);

	const indexed: ContentPort<TCard, TAbility> = {
		card(id) {
			const found = cardsById.get(id);
			if (found === undefined) fail(`carta inexistente: ${id}`);
			return found;
		},
		hasCard: (id) => cardsById.has(id),
		cards: () => cardsList,
		abilitiesOf: (cardId) => abilitiesByCard.get(cardId) ?? [],
		ability: (id) => content.ability(id),
		hasAbility: (id) => content.hasAbility(id),
		text: (key, params) => content.text(key, params),
	};

	return Object.freeze({
		ruleset: deepFreeze(ruleset),
		content: Object.freeze({ ...content, ...indexed }) as TContent,
		kinds: cfg.kinds,
		dice: cfg.dice,
		requirements: cfg.requirements,
		scopes: cfg.scopes,
		flow: cfg.flow as TFlow,
	});
}

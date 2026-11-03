import {
	type PendingBundle,
	type PendingSkillChoice,
	type PendingSkillTarget,
	choicesOfBundle,
	pendingResolutionOf,
} from "../choices";
import type { PendingChoice } from "../../engine/choice";
import {
	type ProjectOptions,
	type ProjectedEngine,
	project,
} from "../../engine/projection";
import type { EffectStack, PausedState } from "../effects/stack";
import type { PendingSkillWindow } from "../skills/resolveSkillWindow";
import type { PendingTriggerInterrupt } from "../triggers/engine";
import type { ScopeRegistry } from "../../engine/scopes";
import { clearScope } from "../../engine/turns";
import { addToCounter, type CounterRef, counterOf, gameOf, withGame } from "../../engine/state";
import type {
	Component,
	DamageStatComponent,
	DiceComponent,
	Entity,
	HealthComponent,
} from "../ecs/types";
import {
	createEntity,
	getModifierTotal,
	removeEntity,
	upsertEntity,
	type World,
} from "../ecs/world";
import { type ColorIndex, MAX_COLOR_INDEX } from "./color";
import type { CombatState } from "./combatState";
import type { GameState } from "./gameState";
import type { EnemyRecord, EnemyState } from "./enemyState";
import type { HeroRecord, HeroState } from "./heroState";
import {
	DECK_NAMES,
	dealDecks,
	type DeckName,
	type DeckPiles,
	type DeckSet,
	readPiles,
	shuffleDeckZone,
	moveDeckCards,
	writePiles,
} from "./zones";

export type { DeckName, DeckPiles, DeckSet };

export function deckOf(state: GameState, name: DeckName): DeckPiles {
	return readPiles(state.engine, name);
}

export function withDeck(
	state: GameState,
	name: DeckName,
	deck: DeckPiles,
): GameState {
	return { ...state, engine: writePiles(state.engine, name, deck) };
}

export function shuffleDeck(state: GameState, name: DeckName): GameState {
	const { engine, rng } = shuffleDeckZone(
		state.engine,
		gameOf(state).rng,
		name,
		"available",
	);
	return withGame({ ...state, engine }, (prevGame) => ({ ...prevGame, rng }));
}

export function discardDeckTop(
	state: GameState,
	name: DeckName,
	count: number,
): GameState {
	return {
		...state,
		engine: moveDeckCards(state.engine, name, "available", "discarded", count),
	};
}

const PROGRESS_SCOPES = ["game", "hero"];

export function dealDecksInto(
	state: GameState,
	lists: Readonly<Record<DeckName, readonly string[]>>,
	keepProgress = false,
): GameState {
	const dealt = dealDecks(gameOf(state).rng, lists);
	const engine = keepProgress
		? {
				...dealt.engine,
				counters: { ...progressCounters(state), ...dealt.engine.counters },
			}
		: dealt.engine;
	return withGame({ ...state, engine }, (prevGame) => ({ ...prevGame, rng: dealt.rng }));
}

export function decksOf(state: GameState): DeckSet {
	return {
		dungeonDeck: deckOf(state, "dungeonDeck"),
		enemyDeck: deckOf(state, "enemyDeck"),
		itemDeck: deckOf(state, "itemDeck"),
		artifactDeck: deckOf(state, "artifactDeck"),
	};
}

export function withDecks(state: GameState, decks: DeckSet): GameState {
	return DECK_NAMES.reduce(
		(next, name) => withDeck(next, name, decks[name]),
		state,
	);
}

function progressCounters(state: GameState): Record<string, number> {
	return Object.fromEntries(
		Object.entries(state.engine.counters).filter(([key]) =>
			PROGRESS_SCOPES.some((scope) => key.startsWith(`${scope}:`)),
		),
	);
}

const AWAKENING: CounterRef = { scope: "game", id: "game", name: "awakening" };

function heroImpeto(heroId: string): CounterRef {
	return { scope: "hero", id: heroId, name: "impeto" };
}

function setCounter(
	state: GameState,
	ref: CounterRef,
	value: number,
): GameState {
	if (!Number.isInteger(value) || value < 0 || value > MAX_COLOR_INDEX) {
		throw new RangeError(`${ref.name} fora de 0..${MAX_COLOR_INDEX}: ${value}`);
	}
	const delta = value - counterOf(state.engine, ref);
	if (delta === 0) return state;
	return { ...state, engine: addToCounter(state.engine, ref, delta) };
}

export function hasEngineEvents(state: GameState): boolean {
	return state.engine.events.length > 0;
}

export function withoutEngineEvents(state: GameState): GameState {
	return { ...state, engine: { ...state.engine, events: [] } };
}

const POWER_USED: Omit<CounterRef, "id"> = { scope: "room", name: "powerUsed" };

export function powerUsedThisRoom(state: GameState, heroId: string): boolean {
	return counterOf(state.engine, { ...POWER_USED, id: heroId }) > 0;
}

export function withPowerUsedThisRoom(
	state: GameState,
	heroId: string,
): GameState {
	if (powerUsedThisRoom(state, heroId)) return state;
	return {
		...state,
		engine: addToCounter(state.engine, { ...POWER_USED, id: heroId }, 1),
	};
}

const projectionCache = new WeakMap<
	object,
	WeakMap<ProjectOptions, Map<string, ProjectedEngine>>
>();

export function projectedFor(
	state: GameState,
	viewer: string,
	options: ProjectOptions,
): ProjectedEngine {
	let byOptions = projectionCache.get(state.engine.zones);
	if (!byOptions) {
		byOptions = new WeakMap();
		projectionCache.set(state.engine.zones, byOptions);
	}
	let byViewer = byOptions.get(options);
	if (!byViewer) {
		byViewer = new Map();
		byOptions.set(options, byViewer);
	}
	let projected = byViewer.get(viewer);
	if (!projected) {
		projected = project(state.engine, viewer, options);
		byViewer.set(viewer, projected);
	}
	return projected;
}

export function pilesOf(state: GameState, deck: DeckName): DeckPiles {
	return readPiles(state.engine, deck);
}

export type FlagScope = "game" | "room" | "combat" | "round";

export function scopedCountOf(
	state: GameState,
	scope: FlagScope,
	name: string,
	id: string,
): number {
	return counterOf(state.engine, { scope, id, name });
}

export function withScopedCount(
	state: GameState,
	scope: FlagScope,
	name: string,
	id: string,
	value: number,
): GameState {
	const ref: CounterRef = { scope, id, name };
	const delta = value - counterOf(state.engine, ref);
	if (delta === 0) return state;
	return { ...state, engine: addToCounter(state.engine, ref, delta) };
}

export function scopedFlagOf(
	state: GameState,
	scope: FlagScope,
	name: string,
	id: string,
): boolean {
	return scopedCountOf(state, scope, name, id) > 0;
}

export function withScopedFlag(
	state: GameState,
	scope: FlagScope,
	name: string,
	id: string,
	on = true,
): GameState {
	return withScopedCount(state, scope, name, id, on ? 1 : 0);
}

export function endScope(
	state: GameState,
	registry: ScopeRegistry,
	scope: string,
): GameState {
	return { ...state, engine: clearScope(state.engine, registry, scope) };
}

export function extraDiceOf(state: GameState, heroId: string): number {
	return getModifierTotal(gameOf(state).world, heroId, "extra_dice");
}

export function countersOf(state: GameState): unknown {
	return state.engine.counters;
}

export function awakeningOf(state: GameState): ColorIndex {
	return counterOf(state.engine, AWAKENING) as ColorIndex;
}

export function withAwakening(
	state: GameState,
	awakening: ColorIndex,
): GameState {
	return setCounter(state, AWAKENING, awakening);
}

export function impetoOf(state: GameState, heroId: string): ColorIndex {
	return counterOf(state.engine, heroImpeto(heroId)) as ColorIndex;
}

export function withImpeto(
	state: GameState,
	heroId: string,
	impeto: ColorIndex,
): GameState {
	return setCounter(state, heroImpeto(heroId), impeto);
}

export function worldOf(state: GameState): World {
	return gameOf(state).world;
}

export function withWorld(state: GameState, world: World): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, world }));
}

export type UnitStat =
	| "currentLife"
	| "maxLife"
	| "damage"
	| "hitBonus"
	| "dice";

export type UnitId = string;

type Unit = HeroState | EnemyState;

const STAT_TYPES = new Set<string>([
	"health",
	"damage_stat",
	"dice",
	"condition",
	"token",
]);

export function isStatComponent(component: Component): boolean {
	return STAT_TYPES.has(component.type);
}

function statComponents(stats: {
	readonly maxLife: number;
	readonly currentLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	readonly conditions: readonly string[];
	readonly healBlocked?: boolean;
	readonly tokens?: Readonly<Record<string, number>>;
}): Component[] {
	const components: Component[] = [
		{
			type: "health",
			current: stats.currentLife,
			max: stats.maxLife,
			healBlocked: stats.healBlocked ?? false,
		},
		{ type: "damage_stat", damage: stats.damage, hitBonus: stats.hitBonus },
		{ type: "dice", count: stats.dice },
	];
	for (const conditionType of stats.conditions) {
		components.push({
			type: "condition",
			conditionType,
			duration: { kind: "this_combat" },
		});
	}
	for (const [tokenType, count] of Object.entries(stats.tokens ?? {})) {
		components.push({ type: "token", tokenType, count });
	}
	return components;
}

export function recordOfHero(hero: HeroState): HeroRecord {
	const {
		maxLife: _m,
		currentLife: _c,
		damage: _d,
		hitBonus: _h,
		dice: _di,
		conditions: _co,
		healBlocked: _hb,
		...record
	} = hero;
	return record;
}

export function recordOfEnemy(enemy: EnemyState): EnemyRecord {
	const {
		maxLife: _m,
		currentLife: _c,
		damage: _d,
		hitBonus: _h,
		dice: _di,
		conditions: _co,
		tokens: _t,
		...record
	} = enemy;
	return record;
}

function withStatComponents(
	world: World,
	id: string,
	type: "hero" | "enemy" | "subboss",
	components: readonly Component[],
): World {
	const kept = (world.entities[id]?.components ?? []).filter(
		(component) => !STAT_TYPES.has(component.type),
	);
	return upsertEntity(world, createEntity(id, type, [...components, ...kept]));
}

export function spawnHero(world: World, hero: HeroState): World {
	return withStatComponents(world, hero.id, "hero", statComponents(hero));
}

export function spawnEnemy(world: World, enemy: EnemyState): World {
	return withStatComponents(
		world,
		enemy.id,
		enemy.isSubboss ? "subboss" : "enemy",
		statComponents(enemy),
	);
}

function missing(id: string): never {
	throw new Error(`Entidade sem componentes de combate no world: ${id}`);
}

function readStats(world: World, id: string) {
	const entity = world.entities[id];
	if (!entity) return missing(id);
	let health: HealthComponent | undefined;
	let damageStat: DamageStatComponent | undefined;
	let dice: DiceComponent | undefined;
	const conditions: string[] = [];
	const tokens: Record<string, number> = {};
	for (const component of entity.components) {
		switch (component.type) {
			case "health":
				health = component;
				break;
			case "damage_stat":
				damageStat = component;
				break;
			case "dice":
				dice = component;
				break;
			case "condition":
				conditions.push(component.conditionType);
				break;
			case "token":
				tokens[component.tokenType] = component.count;
				break;
			default:
				break;
		}
	}
	if (!health || !damageStat || !dice) return missing(id);
	return { health, damageStat, dice, conditions, tokens, entity };
}

interface ViewCacheEntry<T> {
	readonly entity: Entity;
	readonly view: T;
}

const heroViews = new WeakMap<HeroRecord, ViewCacheEntry<HeroState>>();
const enemyViews = new WeakMap<EnemyRecord, ViewCacheEntry<EnemyState>>();

export function heroView(world: World, record: HeroRecord): HeroState {
	const cached = heroViews.get(record);
	if (cached && cached.entity === world.entities[record.id]) return cached.view;
	const { health, damageStat, dice, conditions, entity } = readStats(
		world,
		record.id,
	);
	const view: HeroState = {
		...record,
		maxLife: health.max,
		currentLife: health.current,
		damage: damageStat.damage,
		hitBonus: damageStat.hitBonus,
		dice: dice.count,
		conditions,
		...(health.healBlocked ? { healBlocked: true } : {}),
	};
	heroViews.set(record, { entity, view });
	return view;
}

export function enemyView(world: World, record: EnemyRecord): EnemyState {
	const cached = enemyViews.get(record);
	if (cached && cached.entity === world.entities[record.id]) return cached.view;
	const { health, damageStat, dice, conditions, tokens, entity } = readStats(
		world,
		record.id,
	);
	const view: EnemyState = {
		...record,
		maxLife: health.max,
		currentLife: health.current,
		damage: damageStat.damage,
		hitBonus: damageStat.hitBonus,
		dice: dice.count,
		tokens,
		conditions,
	};
	enemyViews.set(record, { entity, view });
	return view;
}

const heroLists = new WeakMap<object, readonly HeroState[]>();
const enemyLists = new WeakMap<object, readonly EnemyState[]>();

function stableList<T>(
	cache: WeakMap<object, readonly T[]>,
	key: object,
	next: readonly T[],
): readonly T[] {
	const prev = cache.get(key);
	if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) {
		return prev;
	}
	cache.set(key, next);
	return next;
}

export function projectHeroes(
	world: World,
	records: readonly HeroRecord[],
): readonly HeroState[] {
	return stableList(
		heroLists,
		records,
		records.map((record) => heroView(world, record)),
	);
}

export function projectEnemies(
	world: World,
	records: readonly EnemyRecord[],
): readonly EnemyState[] {
	return stableList(
		enemyLists,
		records,
		records.map((record) => enemyView(world, record)),
	);
}

export function heroesOf(state: GameState): readonly HeroState[] {
	return projectHeroes(gameOf(state).world, gameOf(state).heroes);
}

export function defeatedHeroesOf(state: GameState): readonly HeroState[] {
	return projectHeroes(gameOf(state).world, gameOf(state).defeatedHeroes);
}

export function fledHeroesOf(state: GameState): readonly HeroState[] {
	return projectHeroes(gameOf(state).world, gameOf(state).fledHeroes);
}

export function enemiesOf(state: GameState): readonly EnemyState[] {
	return projectEnemies(gameOf(state).world, gameOf(state).activeEnemies);
}

export function graveyardOf(state: GameState): readonly EnemyState[] {
	return projectEnemies(gameOf(state).world, gameOf(state).enemyGraveyard);
}

export function allHeroesOf(state: GameState): readonly HeroState[] {
	return [
		...heroesOf(state),
		...defeatedHeroesOf(state),
		...fledHeroesOf(state),
	];
}

export function heroOf(state: GameState, id: UnitId): HeroState | undefined {
	const record =
		gameOf(state).heroes.find((hero) => hero.id === id) ??
		gameOf(state).defeatedHeroes.find((hero) => hero.id === id) ??
		gameOf(state).fledHeroes.find((hero) => hero.id === id);
	return record ? heroView(gameOf(state).world, record) : undefined;
}

export function enemyOf(state: GameState, id: UnitId): EnemyState | undefined {
	const record =
		gameOf(state).activeEnemies.find((enemy) => enemy.id === id) ??
		gameOf(state).enemyGraveyard.find((enemy) => enemy.id === id);
	return record ? enemyView(gameOf(state).world, record) : undefined;
}

export function unitOf(state: GameState, id: UnitId): Unit | undefined {
	return heroOf(state, id) ?? enemyOf(state, id);
}

export function statOf(
	state: GameState,
	id: UnitId,
	stat: UnitStat,
): number | undefined {
	return unitOf(state, id)?.[stat];
}

export interface UnitPatch {
	readonly currentLife?: number;
	readonly maxLife?: number;
	readonly damage?: number;
	readonly hitBonus?: number;
	readonly dice?: number;
	readonly healBlocked?: boolean;
	readonly conditions?: readonly string[];
	readonly tokens?: Readonly<Record<string, number>>;
}

function replaceGroup(
	components: readonly Component[],
	type: Component["type"],
	replacement: readonly Component[],
): Component[] {
	const first = components.findIndex((c) => c.type === type);
	const rest = components.filter((c) => c.type !== type);
	const at = first < 0 ? rest.length : first;
	return [...rest.slice(0, at), ...replacement, ...rest.slice(at)];
}

export function withUnitStats(
	state: GameState,
	id: UnitId,
	patch: UnitPatch,
): GameState {
	const entity = gameOf(state).world.entities[id];
	if (!entity) return missing(id);
	let components: Component[] = entity.components.map((component) => {
		switch (component.type) {
			case "health":
				return {
					...component,
					current: patch.currentLife ?? component.current,
					max: patch.maxLife ?? component.max,
					healBlocked: patch.healBlocked ?? component.healBlocked,
				};
			case "damage_stat":
				return {
					...component,
					damage: patch.damage ?? component.damage,
					hitBonus: patch.hitBonus ?? component.hitBonus,
				};
			case "dice":
				return { ...component, count: patch.dice ?? component.count };
			default:
				return component;
		}
	});
	if (patch.conditions) {
		components = replaceGroup(
			components,
			"condition",
			patch.conditions.map((conditionType) => ({
				type: "condition",
				conditionType,
				duration: { kind: "this_combat" },
			})),
		);
	}
	if (patch.tokens) {
		components = replaceGroup(
			components,
			"token",
			Object.entries(patch.tokens).map(([tokenType, count]) => ({
				type: "token",
				tokenType,
				count,
			})),
		);
	}
	return withWorld(state, upsertEntity(gameOf(state).world, { ...entity, components }));
}

export function withEntityRetired(state: GameState, id: UnitId): GameState {
	const entity = gameOf(state).world.entities[id];
	if (!entity) return state;
	return withWorld(
		state,
		upsertEntity(gameOf(state).world, {
			...entity,
			components: entity.components.filter(
				(component) =>
					component.type !== "trigger" && component.type !== "modifier",
			),
		}),
	);
}

export function withHeroRecord(
	state: GameState,
	heroId: string,
	fn: (record: HeroRecord) => HeroRecord,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, heroes: gameOf(state).heroes.map((record) =>
			record.id === heroId ? fn(record) : record,
		) }));
}

export function withEnemyRecord(
	state: GameState,
	enemyId: string,
	fn: (record: EnemyRecord) => EnemyRecord,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, activeEnemies: gameOf(state).activeEnemies.map((record) =>
			record.id === enemyId ? fn(record) : record,
		) }));
}

export function withoutStaleEnemies(state: GameState): GameState {
	const live = new Set(
		[...gameOf(state).activeEnemies, ...gameOf(state).enemyGraveyard].map((e) => e.id),
	);
	let world = gameOf(state).world;
	for (const entity of Object.values(gameOf(state).world.entities)) {
		if (
			(entity.type === "enemy" || entity.type === "subboss") &&
			!live.has(entity.id)
		) {
			world = removeEntity(world, entity.id);
		}
	}
	return world === gameOf(state).world ? state : withWorld(state, world);
}

export function combatOf(state: GameState): CombatState | null {
	return gameOf(state).combat;
}

function bundleOf(state: GameState): PendingBundle {
	return (state.engine.pending?.choice.data as PendingBundle | undefined) ?? {};
}

export function pendingChoicesOf(state: GameState): readonly PendingChoice[] {
	return choicesOfBundle(bundleOf(state));
}

function withBundle(state: GameState, bundle: PendingBundle): GameState {
	return {
		...state,
		engine: { ...state.engine, pending: pendingResolutionOf(bundle) },
	};
}

function patchBundle(
	state: GameState,
	key: keyof PendingBundle,
	value: PendingBundle[keyof PendingBundle] | undefined,
): GameState {
	const next: Record<string, unknown> = { ...bundleOf(state) };
	if (value === undefined) delete next[key];
	else next[key] = value;
	return withBundle(state, next as PendingBundle);
}

export function pausedOf(state: GameState): PausedState | null {
	return bundleOf(state).paused ?? null;
}

export function withPaused(state: GameState, paused: PausedState | null): GameState {
	return patchBundle(state, "paused", paused ?? undefined);
}

export function pendingSkillTargetOf(state: GameState): PendingSkillTarget | undefined {
	return bundleOf(state).skillTarget;
}

export function withPendingSkillTarget(
	state: GameState,
	value: PendingSkillTarget | undefined,
): GameState {
	return patchBundle(state, "skillTarget", value);
}

export function pendingSkillChoiceOf(state: GameState): PendingSkillChoice | undefined {
	return bundleOf(state).skillChoice;
}

export function withPendingSkillChoice(
	state: GameState,
	value: PendingSkillChoice | undefined,
): GameState {
	return patchBundle(state, "skillChoice", value);
}

export function pendingTriggerInterruptOf(
	state: GameState,
): PendingTriggerInterrupt | undefined {
	return bundleOf(state).triggerInterrupt;
}

export function withPendingTriggerInterrupt(
	state: GameState,
	value: PendingTriggerInterrupt | undefined,
): GameState {
	return patchBundle(state, "triggerInterrupt", value);
}

export function withNestedSkillWindow(
	state: GameState,
	parent: PendingSkillWindow,
): GameState {
	const current = pendingSkillWindowOf(state);
	return withPendingSkillWindow(state, current ? { ...current, parent } : parent);
}

export function pendingSkillWindowOf(state: GameState): PendingSkillWindow | undefined {
	return bundleOf(state).skillWindow;
}

export function withPendingSkillWindow(
	state: GameState,
	value: PendingSkillWindow | undefined,
): GameState {
	return patchBundle(state, "skillWindow", value);
}

export function effectStackOf(state: GameState): EffectStack {
	return state.engine.stack as EffectStack;
}

export function withEffectStack(state: GameState, stack: EffectStack): GameState {
	return { ...state, engine: { ...state.engine, stack } };
}

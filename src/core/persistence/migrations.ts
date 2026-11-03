import {
	type PendingBundle,
	pausedFromLegacy,
	pendingResolutionOf,
} from "../choices";
import {
	createDeckEngine,
	DECK_NAMES,
	type DeckSet,
	writePiles,
} from "../state/zones";

export const STATE_VERSION = 6;

export interface SnapshotEnvelope {
	readonly stateVersion: number;
	readonly gameVersion: string;
	readonly state: unknown;
}

export type Migration = (raw: unknown) => unknown;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	0: (raw) => raw,
	1: decksToZones,
	2: fieldsToCounters,
	3: statsToWorld,
	4: flatToEngineGame,
	5: scopedFlagsToCounters,
};

// Pacote de replay guarda só o log de actions: a representação do estado não o afeta.
export const REPLAY_MIGRATIONS: Readonly<Record<number, Migration>> = {
	0: (raw) => raw,
	1: (raw) => raw,
	2: (raw) => raw,
	3: (raw) => raw,
	4: (raw) => raw,
	5: (raw) => raw,
};

function decksToZones(raw: unknown): unknown {
	const { decks, ...rest } = raw as { decks?: DeckSet } & Record<string, unknown>;
	if (!decks) throw new Error("snapshot v1 sem decks");
	let engine = createDeckEngine();
	for (const name of DECK_NAMES) engine = writePiles(engine, name, decks[name]);
	return { ...rest, engine };
}

type Raw = Record<string, unknown>;

function fieldsToCounters(raw: unknown): unknown {
	const { despertar, heroes, defeatedHeroes, fledHeroes, world, engine, ...rest } =
		raw as Raw;
	const base = engine as { counters?: Record<string, number> } | undefined;
	if (!base || typeof despertar !== "number" || !Array.isArray(heroes)) {
		throw new Error("snapshot v2 sem engine, despertar ou heroes");
	}
	const counters: Record<string, number> = { ...base.counters };
	const put = (key: string, value: unknown) => {
		if (typeof value !== "number") throw new Error(`contador inválido: ${key}`);
		if (value !== 0) counters[key] = value;
	};
	put("game:game:awakening", despertar);
	const strip = (list: unknown): unknown[] =>
		((list as Raw[] | undefined) ?? []).map((hero) => {
			const { impeto, ...kept } = hero;
			put(`hero:${String(hero["id"])}:impeto`, impeto);
			return kept;
		});
	const stripped = { heroes: strip(heroes), defeatedHeroes: strip(defeatedHeroes), fledHeroes: strip(fledHeroes) };
	const entities = Object.fromEntries(
		Object.entries(((world as Raw).entities ?? {}) as Record<string, Raw>).map(
			([id, entity]) => [
				id,
				{
					...entity,
					components: ((entity["components"] as Raw[]) ?? []).filter(
						(component) => component["type"] !== "impeto",
					),
				},
			],
		),
	);
	return {
		...rest,
		...stripped,
		world: { ...(world as Raw), entities },
		engine: { ...base, counters },
	};
}

const STAT_COMPONENT_TYPES = new Set([
	"health",
	"damage_stat",
	"dice",
	"condition",
	"token",
	"item_equipped",
	"item_backpack",
]);

const DEAD_COMBAT_FIELDS = [
	"shieldsUsedThisCombat",
	"powersUsedThisRoom",
	"extraDice",
	"temporaryEffects",
];

const HERO_STAT_FIELDS = [
	"maxLife",
	"currentLife",
	"damage",
	"hitBonus",
	"dice",
	"conditions",
	"healBlocked",
] as const;

const ENEMY_STAT_FIELDS = [...HERO_STAT_FIELDS, "tokens"] as const;

function statComponentsOf(unit: Raw): Raw[] {
	const components: Raw[] = [
		{
			type: "health",
			current: unit["currentLife"],
			max: unit["maxLife"],
			healBlocked: unit["healBlocked"] === true,
		},
		{ type: "damage_stat", damage: unit["damage"], hitBonus: unit["hitBonus"] },
		{ type: "dice", count: unit["dice"] },
	];
	for (const conditionType of (unit["conditions"] as string[] | undefined) ?? []) {
		components.push({
			type: "condition",
			conditionType,
			duration: { kind: "this_combat" },
		});
	}
	for (const [tokenType, count] of Object.entries(
		(unit["tokens"] as Record<string, number> | undefined) ?? {},
	)) {
		components.push({ type: "token", tokenType, count });
	}
	return components;
}

function statsToWorld(raw: unknown): unknown {
	const state = raw as Raw;
	const world = state["world"] as { entities?: Record<string, Raw> } | undefined;
	if (!world || !Array.isArray(state["heroes"])) {
		throw new Error("snapshot v3 sem world ou heroes");
	}
	const entities: Record<string, Raw> = { ...(world.entities ?? {}) };
	const strip = (
		list: unknown,
		fields: readonly string[],
		hero: boolean,
	): Raw[] =>
		((list as Raw[] | undefined) ?? []).map((unit) => {
			const id = String(unit["id"]);
			if (typeof unit["currentLife"] !== "number") return unit;
			const previous = entities[id];
			const kept = ((previous?.["components"] as Raw[] | undefined) ?? []).filter(
				(component) => !STAT_COMPONENT_TYPES.has(String(component["type"])),
			);
			entities[id] = {
				id,
				type: hero ? "hero" : unit["isSubboss"] ? "subboss" : "enemy",
				components: [...statComponentsOf(unit), ...kept],
			};
			return Object.fromEntries(
				Object.entries(unit).filter(([key]) => !fields.includes(key)),
			);
		});
	const counters: Record<string, number> = {
		...((state["engine"] as { counters?: Record<string, number> }).counters ?? {}),
	};
	const combat = state["combat"] as Raw | null | undefined;
	for (const [heroId, used] of Object.entries(
		(combat?.["powersUsedThisRoom"] as Record<string, boolean> | undefined) ?? {},
	)) {
		if (used) counters[`room:${heroId}:powerUsed`] = 1;
	}
	for (const [heroId, extra] of Object.entries(
		(combat?.["extraDice"] as Record<string, number> | undefined) ?? {},
	)) {
		const entity = entities[heroId];
		if (!entity || !extra) continue;
		entity["components"] = [
			...(entity["components"] as Raw[]),
			{
				type: "modifier",
				target: "extra_dice",
				operation: "add",
				value: extra,
				source: heroId,
				duration: { kind: "this_combat" },
			},
		];
	}
	const cleanCombat = combat
		? Object.fromEntries(
				Object.entries(combat).filter(
					([key]) => !DEAD_COMBAT_FIELDS.includes(key),
				),
			)
		: combat;
	return {
		...state,
		combat: cleanCombat,
		engine: { ...(state["engine"] as Raw), counters },
		heroes: strip(state["heroes"], HERO_STAT_FIELDS, true),
		defeatedHeroes: strip(state["defeatedHeroes"], HERO_STAT_FIELDS, true),
		fledHeroes: strip(state["fledHeroes"], HERO_STAT_FIELDS, true),
		activeEnemies: strip(state["activeEnemies"], ENEMY_STAT_FIELDS, false),
		enemyGraveyard: strip(state["enemyGraveyard"], ENEMY_STAT_FIELDS, false),
		world: { ...world, entities },
	};
}

const ENGINE_LEVEL_FIELDS = [
	"engine",
	"effectStack",
	"paused",
	"pendingSkillTarget",
	"pendingSkillChoice",
	"pendingTriggerInterrupt",
	"pendingSkillWindow",
];

function pausedOfRaw(raw: unknown): PendingBundle["paused"] {
	if (!raw || typeof raw !== "object") return undefined;
	const paused = raw as Raw;
	if (paused["choice"]) return paused as unknown as PendingBundle["paused"];
	const options = (paused["options"] as { id: string; label: string }[]) ?? [];
	return pausedFromLegacy(
		String(paused["reason"]),
		options,
		paused["resumeFrom"] as never,
	);
}

function flatToEngineGame(raw: unknown): unknown {
	const flat = raw as Raw;
	const engine = flat["engine"] as Raw | undefined;
	if (!engine || typeof engine !== "object") {
		throw new Error("snapshot v4 sem engine");
	}
	const bundle: Record<string, unknown> = {};
	const paused = pausedOfRaw(flat["paused"]);
	if (paused) bundle["paused"] = paused;
	const put = (key: string, value: unknown) => {
		if (value) bundle[key] = value;
	};
	put("skillTarget", flat["pendingSkillTarget"]);
	put("skillChoice", flat["pendingSkillChoice"]);
	put("triggerInterrupt", flat["pendingTriggerInterrupt"]);
	put("skillWindow", flat["pendingSkillWindow"]);
	const pending = pendingResolutionOf(bundle as PendingBundle);
	const game = Object.fromEntries(
		Object.entries(flat).filter(([key]) => !ENGINE_LEVEL_FIELDS.includes(key)),
	);
	return {
		engine: {
			...engine,
			stack: flat["effectStack"] ?? { pending: [], resolving: null },
			...(pending ? { pending } : {}),
		},
		game,
	};
}

const LEGACY_SCOPED_FLAGS = [
	"oncePer",
	"ecoTokens",
	"fleeAttemptByHero",
	"itemControlByEnemy",
	"targetProtectionByHero",
	"bossFirstDamageReduced",
] as const;

function scopedFlagsToCounters(raw: unknown): unknown {
	const { engine, game } = raw as { engine?: Raw; game?: Raw };
	if (!engine || !game) throw new Error("snapshot v5 sem engine ou game");
	const counters: Record<string, number> = {
		...((engine["counters"] as Record<string, number> | undefined) ?? {}),
	};
	const put = (scope: string, name: string, id: string, value: number) => {
		if (value > 0) counters[`${scope}:${id}:${name}`] = value;
	};
	const putFlags = (scope: string, name: string, flags: unknown) => {
		for (const [id, on] of Object.entries((flags as Record<string, boolean>) ?? {})) {
			if (on) put(scope, name, id, 1);
		}
	};
	const combat = game["combat"] as Raw | null | undefined;
	const oncePer = (game["oncePer"] as Raw | undefined) ?? {};
	putFlags("room", "oncePer", oncePer["room"]);
	if (combat) {
		const combatOnce = (combat["oncePer"] as Raw | undefined) ?? {};
		putFlags("room", "oncePer", combatOnce["room"]);
		putFlags("combat", "oncePer", combatOnce["combat"]);
		putFlags("round", "oncePer", combatOnce["round"]);
		for (const [id, count] of Object.entries(
			(combat["ecoTokens"] as Record<string, number> | undefined) ?? {},
		)) {
			put("combat", "eco", id, count);
		}
		putFlags("combat", "fleeAttempt", combat["fleeAttemptByHero"]);
		putFlags("combat", "itemControl", combat["itemControlByEnemy"]);
		putFlags("combat", "targetProtection", combat["targetProtectionByHero"]);
		if (combat["bossFirstDamageReduced"] === true) {
			put("round", "bossFirstDamageReduced", "boss", 1);
		}
	}
	const cleanCombat = combat
		? Object.fromEntries(
				Object.entries(combat).filter(
					([key]) => !(LEGACY_SCOPED_FLAGS as readonly string[]).includes(key),
				),
			)
		: combat;
	return {
		engine: { ...engine, counters },
		game: {
			...game,
			oncePer: { game: oncePer["game"] ?? {} },
			...(combat === undefined ? {} : { combat: cleanCombat }),
		},
	};
}

export function isEnvelope(value: unknown): value is SnapshotEnvelope {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj["stateVersion"] === "number" &&
		typeof obj["gameVersion"] === "string" &&
		typeof obj["state"] === "object" &&
		obj["state"] !== null
	);
}

export function wrapSnapshot(
	state: unknown,
	gameVersion: string,
): SnapshotEnvelope {
	return { stateVersion: STATE_VERSION, gameVersion, state };
}

export function migrateState(
	raw: unknown,
	fromVersion: number,
	migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
	target: number = STATE_VERSION,
): unknown | null {
	if (!Number.isInteger(fromVersion) || fromVersion < 0 || fromVersion > target) {
		return null;
	}
	let current = raw;
	for (let version = fromVersion; version < target; version++) {
		const step = migrations[version];
		if (!step) return null;
		try {
			current = step(current);
		} catch {
			return null;
		}
	}
	return current;
}

export function unwrapSnapshot(
	raw: unknown,
	migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
	target: number = STATE_VERSION,
): unknown | null {
	if (typeof raw !== "object" || raw === null) return null;
	if (isEnvelope(raw)) {
		return migrateState(raw.state, raw.stateVersion, migrations, target);
	}
	return migrateState(raw, 0, migrations, target);
}

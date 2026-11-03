import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { gameVersion } from "../gameEngine";
import {
	buildReplayPackage,
	importPackageFromJson,
	replayFromPackage,
} from "../replay/replayEngine";
import { createLocalStoragePersistence } from "./localStoragePersistence";
import {
	isEnvelope,
	MIGRATIONS,
	migrateState,
	STATE_VERSION,
	unwrapSnapshot,
	wrapSnapshot,
} from "./migrations";
import replayV0 from "./__fixtures__/replay.v0.json";
import replayV1 from "./__fixtures__/replay.v1.json";
import replayV2 from "./__fixtures__/replay.v2.json";
import snapshotV0 from "./__fixtures__/snapshot.v0.json";
import snapshotV1 from "./__fixtures__/snapshot.v1.json";
import snapshotV2 from "./__fixtures__/snapshot.v2.json";
import { awakeningOf, decksOf, heroView, impetoOf } from "../state/access";
import { engineOf, gameOf } from "../../engine/state";
import type { GameState } from "../state/gameState";
import { zoneViolation } from "../state/zones";

const engineWithSave = {
	...testEngine,
	ruleset: {
		...testEngine.ruleset,
		balance: {
			...testEngine.ruleset.balance,
			featureFlags: { enableSubBosses: false, enableSave: true },
		},
	},
};
const port = createLocalStoragePersistence(engineWithSave);
const values = new Map<string, string>();

beforeEach(() => {
	values.clear();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
	});
});
afterEach(() => vi.unstubAllGlobals());

const comparable = (state: object) => {
	const full = state as GameState;
	const { actionLog: _log, alphaLog: _alpha, damageFeedback: _damage, healFeedback: _heal, extraAttackFeedback: _extra, ...game } = gameOf(full);
	const heroIds = [...game.heroes, ...game.defeatedHeroes, ...game.fledHeroes].map(
		(hero) => hero.id,
	);
	return JSON.parse(
		JSON.stringify({
			game,
			stack: engineOf(full).stack,
			pending: engineOf(full).pending,
			decks: decksOf(full),
			despertar: awakeningOf(full),
			impeto: heroIds.map((id) => impetoOf(full, id)),
		}),
	);
};

const migratedV0 = unwrapSnapshot(snapshotV0) as GameState;

describe("cadeia de migrações", () => {
	it("aplica v0→v1…→atual na ordem e recusa versão futura ou lacuna", () => {
		const steps = {
			0: (raw: unknown) => ({ ...(raw as object), a: 1 }),
			1: (raw: unknown) => ({ ...(raw as object), b: 2 }),
		};
		expect(migrateState({}, 0, steps, 2)).toEqual({ a: 1, b: 2 });
		expect(migrateState({ a: 1 }, 1, steps, 2)).toEqual({ a: 1, b: 2 });
		expect(migrateState({}, 3, steps, 2)).toBeNull();
		expect(migrateState({}, 0, { 0: steps[0] }, 2)).toBeNull();
		expect(
			migrateState({}, 0, { 0: () => { throw new Error("x"); } }, 1),
		).toBeNull();
	});

	it("snapshot sem envelope é v0; com envelope respeita stateVersion", () => {
		expect(isEnvelope(snapshotV0)).toBe(false);
		const env = wrapSnapshot({ x: 1 }, "9.9.9");
		expect(env).toEqual({ stateVersion: STATE_VERSION, gameVersion: "9.9.9", state: { x: 1 } });
		expect(unwrapSnapshot(env)).toEqual({ x: 1 });
		expect(unwrapSnapshot({ ...env, stateVersion: STATE_VERSION + 1 })).toBeNull();
		expect(unwrapSnapshot(null)).toBeNull();
	});
});

describe("migração v1→v2 (decks → zonas)", () => {
	it("decksToZones preserva a ordem das pilhas e deixa cada instância em uma zona", () => {
		const migrated = migrateState(
			{ decks: snapshotV0.decks, rng: snapshotV0.rng },
			1,
			MIGRATIONS,
			2,
		) as GameState;
		expect(decksOf(migrated)).toEqual(snapshotV0.decks);
		expect(zoneViolation(migrated.engine)).toBeNull();
		expect("decks" in migrated).toBe(false);
	});

	it("falha (→ null) quando o v1 não tem decks", () => {
		expect(migrateState({ rng: {} }, 1, MIGRATIONS, 2)).toBeNull();
	});
});

describe("migração v2→v3 (despertar e ímpeto → contadores)", () => {
	it("move despertar e ímpeto para engine.counters e remove campos e componente", () => {
		const migrated = unwrapSnapshot(snapshotV2) as GameState;
		const raw = JSON.stringify(migrated);
		expect(awakeningOf(migrated)).toBe(snapshotV0.despertar);
		expect(impetoOf(migrated, snapshotV0.heroes[0]!.id)).toBe(
			snapshotV0.heroes[0]!.impeto,
		);
		expect(migrated.engine.counters[`hero:${snapshotV0.heroes[0]!.id}:impeto`]).toBe(2);
		expect("despertar" in gameOf(migrated)).toBe(false);
		expect(gameOf(migrated).heroes.every((hero) => !("impeto" in hero))).toBe(true);
		expect(raw).not.toContain('"type":"impeto"');
	});

	it("falha (→ null) quando o v2 não tem engine", () => {
		expect(migrateState({ despertar: 0, heroes: [] }, 2)).toBeNull();
	});
});

describe("fixtures congeladas v0, v1 e v2", () => {
	it.each([
		["v0 sem envelope", snapshotV0],
		["v1 em envelope", snapshotV1],
		["v2 em envelope", snapshotV2],
	])("snapshot %s carrega pela porta no formato atual", (_name, fixture) => {
		values.set("ascensao_heroica_snapshot", JSON.stringify(fixture));
		const loaded = port.loadSnapshot() as GameState;
		expect(zoneViolation(loaded.engine)).toBeNull();
		expect("decks" in gameOf(loaded)).toBe(false);
		expect(comparable(loaded)).toEqual(comparable(migratedV0));
		expect(decksOf(loaded)).toEqual(snapshotV0.decks);
	});

	it("salva em envelope versionado e relê o mesmo estado", () => {
		const loaded = unwrapSnapshot(snapshotV0) as GameState;
		port.saveSnapshot(loaded);
		const saved = JSON.parse(values.get("ascensao_heroica_snapshot") ?? "null");
		expect(saved.stateVersion).toBe(STATE_VERSION);
		expect(saved.gameVersion).toBe(gameVersion(engineWithSave));
		const reread = port.loadSnapshot() as GameState;
		expect(comparable(reread)).toEqual(comparable(loaded));
		expect(reread.engine).toEqual(JSON.parse(JSON.stringify(loaded.engine)));
	});

	it("envelope de versão futura é descartado", () => {
		values.set(
			"ascensao_heroica_snapshot",
			JSON.stringify({ stateVersion: STATE_VERSION + 1, gameVersion: "x", state: {} }),
		);
		expect(port.loadSnapshot()).toBeNull();
	});

	it.each([
		["v0 (sem stateVersion)", replayV0],
		["v1", replayV1],
		["v2", replayV2],
	])("replay %s importa, migra e reproduz o snapshot", (_name, fixture) => {
		const pkg = importPackageFromJson(JSON.stringify(fixture));
		expect(pkg?.stateVersion).toBe(STATE_VERSION);
		const state = replayFromPackage(testEngine, pkg!);
		expect(zoneViolation(state.engine)).toBeNull();
		// A fixture congelada guarda decisões de regras antigas (ex.: Tributo sem item),
		// então só o formato migrado e o determinismo do replay são comparáveis.
		const again = replayFromPackage(testEngine, importPackageFromJson(JSON.stringify(replayV0))!);
		expect(comparable(state)).toEqual(comparable(again));
	});
});

describe("ReplayPackage versionado", () => {
	it("buildReplayPackage grava stateVersion e a importação recusa versão futura", () => {
		const state = replayFromPackage(testEngine, replayV0 as never);
		const pkg = buildReplayPackage(state);
		expect(pkg.stateVersion).toBe(STATE_VERSION);
		expect(importPackageFromJson(JSON.stringify(pkg))).toEqual(pkg);
		expect(
			importPackageFromJson(JSON.stringify({ ...pkg, stateVersion: STATE_VERSION + 1 })),
		).toBeNull();
		expect(importPackageFromJson(JSON.stringify({ ...pkg, stateVersion: "1" }))).toBeNull();
	});
});

describe("migração v3→v4 (vida e atributos → ECS)", () => {
	it("move campos numéricos para componentes e remove flags de combate mortas", async () => {
		const frozen = (await import("./__fixtures__/snapshot.v3.json")).default;
		const before = frozen.state as unknown as { heroes: { currentLife: number; maxLife: number }[] };
		expect(before.heroes[0]?.currentLife).toBeTypeOf("number");
		const migrated = unwrapSnapshot(frozen) as GameState;
		const raw = JSON.stringify(migrated);
		for (const key of ["currentLife", "maxLife", "shieldsUsedThisCombat", "temporaryEffects"]) {
			expect(raw).not.toContain(`"${key}":`);
		}
		const hero = gameOf(migrated).heroes[0]!;
		expect(heroView(gameOf(migrated).world, hero).currentLife).toBe(before.heroes[0]?.currentLife);
		expect(heroView(gameOf(migrated).world, hero).maxLife).toBe(before.heroes[0]?.maxLife);
	});
});

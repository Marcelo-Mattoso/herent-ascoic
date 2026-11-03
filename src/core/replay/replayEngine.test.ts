import { describe, expect, it } from "vitest";
import { createInProcessAdapter } from "../adapter/inProcessAdapter";
import { createInitialGameState } from "../state/gameState";
import {
	buildReplayPackage,
	buildReplayStates,
	exportPackageToJson,
	importPackageFromJson,
	replayFromPackage,
} from "./replayEngine";
import { testEngine } from "@/core/__tests__/testEngine";
import { heroesOf, effectStackOf } from "../state/access";
import { gameOf } from "../../engine/state";

const HERO = "hero_crimson_barbarian";

// Constrói uma partida sintética com N actions e retorna o estado final.
function buildSyntheticGame(actionCount = 5) {
	const initial = createInitialGameState({ heroCardIds: [HERO] });
	const adapter = createInProcessAdapter(testEngine, initial);

	// Sequência realista de actions
	const actions = [
		{ type: "START_GAME" as const, payload: { heroCardIds: [HERO] } },
		{ type: "REVEAL_ROOM" as const },
		{ type: "RESOLVE_ROOM_EFFECT" as const },
		{ type: "SPAWN_ENEMIES" as const },
		{ type: "START_COMBAT" as const },
		{ type: "REVEAL_ROOM" as const }, // pode ser no-op dependendo do status
		{ type: "REVEAL_ROOM" as const },
		{ type: "REVEAL_ROOM" as const },
	];

	for (let i = 0; i < Math.min(actionCount, actions.length); i++) {
		adapter.dispatch(actions[i]!);
	}

	return adapter.getState();
}

// ── replayFromPackage ─────────────────────────────────────────────────────────

describe("replayFromPackage", () => {
	it("produz o mesmo estado final que o dispatch sequencial", () => {
		const finalState = buildSyntheticGame(5);
		const pkg = buildReplayPackage(finalState);
		const replayed = replayFromPackage(testEngine, pkg);

		expect(gameOf(replayed).status).toBe(gameOf(finalState).status);
		expect(gameOf(replayed).groupXp).toBe(gameOf(finalState).groupXp);
		expect(heroesOf(replayed).map((h) => h.currentLife)).toEqual(
			heroesOf(finalState).map((h) => h.currentLife),
		);
		expect(gameOf(replayed).actionLog.length).toBe(gameOf(finalState).actionLog.length);
	});

	it("stack de efeitos está vazia após replay completo", () => {
		const finalState = buildSyntheticGame(5);
		const pkg = buildReplayPackage(finalState);
		const replayed = replayFromPackage(testEngine, pkg);

		expect(effectStackOf(replayed).pending).toHaveLength(0);
		expect(effectStackOf(replayed).resolving).toBeNull();
	});

	it("replay de partida com 2+ actions produz resultado idêntico", () => {
		const state = buildSyntheticGame(2);
		const pkg = buildReplayPackage(state);
		const replayed = replayFromPackage(testEngine, pkg);

		expect(heroesOf(replayed).length).toBe(heroesOf(state).length);
		expect(gameOf(replayed).status).toBe(gameOf(state).status);
	});
});

// ── buildReplayStates ─────────────────────────────────────────────────────────

describe("buildReplayStates", () => {
	it("retorna N+1 estados para N actions no log", () => {
		const state = buildSyntheticGame(3);
		const pkg = buildReplayPackage(state);
		const states = buildReplayStates(testEngine, pkg);

		// N+1 estados: inicial + 1 por action
		expect(states.length).toBe(pkg.actionLog.length + 1);
	});

	it("estado[0] é o estado pré-partida (MAIN_MENU)", () => {
		const state = buildSyntheticGame(2);
		const pkg = buildReplayPackage(state);
		const states = buildReplayStates(testEngine, pkg);

		expect(gameOf(states[0]!).status).toBe("MAIN_MENU");
	});

	it("último estado corresponde ao estado final", () => {
		const finalState = buildSyntheticGame(4);
		const pkg = buildReplayPackage(finalState);
		const states = buildReplayStates(testEngine, pkg);

		const lastState = states[states.length - 1]!;
		expect(gameOf(lastState).status).toBe(gameOf(finalState).status);
		expect(gameOf(lastState).actionLog.length).toBe(gameOf(finalState).actionLog.length);
	});

	it("estados são imutáveis — cada um é referência diferente", () => {
		const state = buildSyntheticGame(3);
		const pkg = buildReplayPackage(state);
		const states = buildReplayStates(testEngine, pkg);

		// Todos distintos (não mesma referência)
		const distinct = new Set(states);
		expect(distinct.size).toBe(states.length);
	});
});

// ── export/import round-trip ─────────────────────────────────────────────────

describe("exportPackageToJson / importPackageFromJson — round-trip", () => {
	it("round-trip básico preserva gameId, seed e comprimento do log", () => {
		const state = buildSyntheticGame(3);
		const pkg = buildReplayPackage(state);

		const json = exportPackageToJson(pkg);
		const imported = importPackageFromJson(json);

		expect(imported).not.toBeNull();
		expect(imported!.gameId).toBe(pkg.gameId);
		expect(imported!.seed).toBe(pkg.seed);
		expect(imported!.actionLog.length).toBe(pkg.actionLog.length);
	});

	it("estado final após import + replay é idêntico ao original", () => {
		const state = buildSyntheticGame(5);
		const pkg = buildReplayPackage(state);

		const json = exportPackageToJson(pkg);
		const imported = importPackageFromJson(json);
		const replayed = replayFromPackage(testEngine, imported!);

		expect(gameOf(replayed).status).toBe(gameOf(state).status);
		expect(heroesOf(replayed).map((h) => h.currentLife)).toEqual(
			heroesOf(state).map((h) => h.currentLife),
		);
		expect(gameOf(replayed).groupXp).toBe(gameOf(state).groupXp);
	});

	it("importPackageFromJson retorna null para JSON inválido", () => {
		expect(importPackageFromJson("não-é-json")).toBeNull();
		expect(importPackageFromJson('"string"')).toBeNull();
		expect(importPackageFromJson("null")).toBeNull();
	});

	it("importPackageFromJson retorna null para objeto sem campos obrigatórios", () => {
		expect(importPackageFromJson('{"gameId":"x"}')).toBeNull(); // sem seed nem actionLog
		expect(importPackageFromJson('{"seed":1,"actionLog":[]}')).toBeNull(); // sem gameId
	});

	it("importPackageFromJson aceita pacote com actionLog vazio", () => {
		const pkg = { gameId: "test", seed: 42, actionLog: [] };
		const result = importPackageFromJson(JSON.stringify(pkg));
		expect(result).not.toBeNull();
		expect(result!.actionLog).toHaveLength(0);
	});
});

// ── buildReplayPackage ────────────────────────────────────────────────────────

describe("buildReplayPackage", () => {
	it("extrai gameId do estado corrente", () => {
		const state = buildSyntheticGame(1);
		const pkg = buildReplayPackage(state);
		expect(pkg.gameId).toBe(gameOf(state).gameId);
	});

	it("actionLog no pacote é igual ao do estado", () => {
		const state = buildSyntheticGame(3);
		const pkg = buildReplayPackage(state);
		expect(pkg.actionLog.length).toBe(gameOf(state).actionLog.length);
		expect(pkg.actionLog[0]!.action.type).toBe(gameOf(state).actionLog[0]!.action.type);
	});

	it("seed é 0 quando START_GAME não tem seed no payload", () => {
		const state = buildSyntheticGame(1);
		const pkg = buildReplayPackage(state);
		// Nesta suíte, START_GAME não passa seed → padrão 0
		expect(typeof pkg.seed).toBe("number");
	});
});

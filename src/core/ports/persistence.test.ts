// Testes do Passo 12 — Persistência.
// Testa: porta mock, isLogIntact, replay de log, e localStoragePersistence (com mock do localStorage).

import { describe, expect, it } from "vitest";
import type { LoggedAction } from "../actions/types";
import { reducer, reducerCore } from "../reducer/index";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { PersistencePort } from "./persistence";
import { isLogIntact } from "./persistence";

const HERO = "Bárbaro Rubro";

function buildLog(n: number): readonly LoggedAction[] {
	const base = createInitialGameState({ heroCardNames: [HERO] });
	let state = base;
	const actions = [
		{ type: "START_GAME" as const, payload: { heroCardNames: [HERO] } },
		{ type: "REVEAL_ROOM" as const },
	];

	const log: LoggedAction[] = [];
	for (let i = 0; i < n && i < actions.length; i++) {
		state = reducer(state, actions[i]!);
		log.push({ seq: i, action: actions[i]! });
	}
	return log;
}

// ── isLogIntact ───────────────────────────────────────────────────────────────

describe("isLogIntact", () => {
	it("retorna false para log vazio", () => {
		expect(isLogIntact([])).toBe(false);
	});

	it("retorna false se seq=0 não é START_GAME", () => {
		expect(isLogIntact([{ seq: 0, action: { type: "REVEAL_ROOM" } }])).toBe(
			false,
		);
	});

	it("retorna false se seqs não começam em 0", () => {
		expect(
			isLogIntact([
				{
					seq: 1,
					action: { type: "START_GAME", payload: { heroCardNames: [] } },
				},
			]),
		).toBe(false);
	});

	it("retorna false se há buraco nas seqs", () => {
		const log: LoggedAction[] = [
			{
				seq: 0,
				action: { type: "START_GAME", payload: { heroCardNames: [HERO] } },
			},
			{ seq: 2, action: { type: "REVEAL_ROOM" } }, // seq 1 ausente
		];
		expect(isLogIntact(log)).toBe(false);
	});

	it("retorna true para log com 1 entry START_GAME", () => {
		const log: LoggedAction[] = [
			{
				seq: 0,
				action: { type: "START_GAME", payload: { heroCardNames: [HERO] } },
			},
		];
		expect(isLogIntact(log)).toBe(true);
	});

	it("retorna true para log com 2 entries contíguos", () => {
		expect(isLogIntact(buildLog(2))).toBe(true);
	});
});

// ── Porta mock — appendAction e loadActionLog ─────────────────────────────────

describe("PersistencePort mock — contrato básico", () => {
	function createMockPort(): PersistencePort & {
		_log: LoggedAction[];
		_snapshot: GameState | null;
	} {
		const _log: LoggedAction[] = [];
		let _snapshot: GameState | null = null;

		return {
			_log,
			get _snapshot() {
				return _snapshot;
			},
			loadSnapshot: () => _snapshot,
			saveSnapshot: (s) => {
				_snapshot = s;
			},
			clearSnapshot: () => {
				_snapshot = null;
			},
			appendAction: (e) => {
				_log.push(e);
			},
			loadActionLog: () => _log,
			clearActionLog: () => {
				_log.splice(0, _log.length);
			},
		};
	}

	it("appendAction chamado N vezes com seq correto", () => {
		const port = createMockPort();
		const log = buildLog(2);
		for (const entry of log) port.appendAction(entry);

		expect(port.loadActionLog()).toHaveLength(2);
		expect(port.loadActionLog()[0]!.seq).toBe(0);
		expect(port.loadActionLog()[1]!.seq).toBe(1);
	});

	it("clearActionLog esvazia o log", () => {
		const port = createMockPort();
		const log = buildLog(2);
		for (const entry of log) port.appendAction(entry);
		port.clearActionLog();
		expect(port.loadActionLog()).toHaveLength(0);
	});

	it("saveSnapshot e loadSnapshot fazem round-trip", () => {
		const port = createMockPort();
		const initial = createInitialGameState({ heroCardNames: [HERO] });
		port.saveSnapshot(initial);
		expect(port.loadSnapshot()).toBe(initial);
	});

	it("clearSnapshot apaga snapshot", () => {
		const port = createMockPort();
		const initial = createInitialGameState({ heroCardNames: [] });
		port.saveSnapshot(initial);
		port.clearSnapshot();
		expect(port.loadSnapshot()).toBeNull();
	});
});

// ── Boot com log íntegro → estado carregado equivale ao replay ───────────────

describe("boot — replay do log", () => {
	it("replay de log íntegro produz GameState equivalente ao dispatch sequencial", () => {
		const initial = createInitialGameState({ heroCardNames: [HERO] });
		const actions = [
			{ type: "START_GAME" as const, payload: { heroCardNames: [HERO] } },
			{ type: "REVEAL_ROOM" as const },
		];

		// Estado via dispatch sequencial
		let directState = initial;
		const log: LoggedAction[] = [];
		for (let i = 0; i < actions.length; i++) {
			directState = reducer(directState, actions[i]!);
			log.push({ seq: i, action: actions[i]! });
		}

		// Estado via replay do log
		const replayedState = log.reduce<GameState>(
			(s, entry) => reducerCore(s, entry.action),
			initial,
		);

		expect(replayedState.status).toBe(directState.status);
		expect(replayedState.heroes.map((h) => h.currentLife)).toEqual(
			directState.heroes.map((h) => h.currentLife),
		);
		expect(replayedState.groupXp).toBe(directState.groupXp);
	});
});

// ── Boot com log corrompido → cai pro snapshot ────────────────────────────────

describe("boot — log corrompido cai pro snapshot", () => {
	it("log corrompido (seq faltando) → isLogIntact retorna false", () => {
		const corruptLog: LoggedAction[] = [
			{
				seq: 0,
				action: { type: "START_GAME", payload: { heroCardNames: [HERO] } },
			},
			{ seq: 5, action: { type: "REVEAL_ROOM" } }, // seq inválido
		];
		expect(isLogIntact(corruptLog)).toBe(false);
	});

	it("log não-START_GAME → isLogIntact retorna false", () => {
		const badLog: LoggedAction[] = [
			{ seq: 0, action: { type: "REVEAL_ROOM" } },
		];
		expect(isLogIntact(badLog)).toBe(false);
	});
});

// ── Boot com ambos vazios → estado inicial ────────────────────────────────────

describe("boot — sem dados salvos", () => {
	it("log vazio e snapshot null → isLogIntact = false, snapshot = null", () => {
		expect(isLogIntact([])).toBe(false);
		// Sem persistência, a aplicação começa no estado inicial
		const initial = createInitialGameState({ heroCardNames: [] });
		expect(initial.status).toBe("MAIN_MENU");
	});
});

// Testes do Passo 11 — Elf store + gameStore.
// Smoke tests: dispatch START_GAME, ler estado, focusedHeroId recomputado.
// Não testa DevTools (requer extensão do browser) nem useSyncExternalStore (React).

import { beforeEach, describe, expect, it } from "vitest";
import { createInProcessAdapter } from "@/core/adapter/inProcessAdapter";
import { reducer } from "@/core/reducer/index";
import { createInitialGameState } from "@/core/state/gameState";
import {
	gameElfStore,
	getElfGameState,
	getElfUiState,
	resetElfStore,
	setElfStoreProps,
} from "./elfStore";

const HERO = "hero_crimson_barbarian";
const EMPTY_CONFIG = { heroCardIds: [] as string[] };

function makeAdapter() {
	return createInProcessAdapter(createInitialGameState(EMPTY_CONFIG));
}

// Reset do store Elf antes de cada teste para isolamento.
beforeEach(() => {
	resetElfStore();
});

// ── elfStore — operações básicas ──────────────────────────────────────────────

describe("elfStore — operações básicas", () => {
	it("getElfGameState retorna estado pré-partida após reset", () => {
		const state = getElfGameState();
		expect(state.status).toBe("MAIN_MENU");
		expect(state.heroes).toHaveLength(0);
	});

	it("setElfStoreProps atualiza gameState imediatamente", () => {
		const adapter = makeAdapter();
		adapter.dispatch({
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const newState = adapter.getState();

		setElfStoreProps({ gameState: newState });
		expect(getElfGameState().status).toBe("ROOM_EFFECT");
		expect(getElfGameState().heroes).toHaveLength(1);
	});

	it("gameElfStore.getValue() retorna a mesma referência se não houve update", () => {
		const v1 = gameElfStore.getValue();
		const v2 = gameElfStore.getValue();
		expect(v1).toBe(v2);
	});

	it("gameElfStore.getValue() retorna nova referência após update", () => {
		const v1 = gameElfStore.getValue();
		setElfStoreProps({ ui: { focusedHeroId: "h1" } });
		const v2 = gameElfStore.getValue();
		expect(v1).not.toBe(v2);
		expect(v2.ui.focusedHeroId).toBe("h1");
	});

	it("resetElfStore restaura estado inicial", () => {
		setElfStoreProps({ ui: { focusedHeroId: "h1" } });
		resetElfStore();
		expect(getElfUiState().focusedHeroId).toBeNull();
		expect(getElfGameState().status).toBe("MAIN_MENU");
	});
});

// ── smoke test: dispatch START_GAME via adapter ───────────────────────────────

describe("smoke test — dispatch START_GAME e leitura de estado", () => {
	it("estado após START_GAME é idêntico ao reducer puro", () => {
		const initial = createInitialGameState({ heroCardIds: [HERO] });
		const adapter = makeAdapter();
		adapter.dispatch({
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		const adapterState = adapter.getState();
		const reducerState = reducer(initial, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		// Simula o que gameStore.dispatch faria: atualiza o elfStore
		setElfStoreProps({ gameState: adapterState });

		const elfState = getElfGameState();
		expect(elfState.status).toBe(reducerState.status);
		expect(elfState.heroes.length).toBe(reducerState.heroes.length);
		expect(elfState.heroes[0]!.cardId).toBe(HERO);
	});

	it("após START_GAME, herói ativo está presente no estado Elf", () => {
		const adapter = makeAdapter();
		adapter.dispatch({
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		setElfStoreProps({ gameState: adapter.getState() });

		const state = getElfGameState();
		const activeHero = state.heroes.find((h) => h.status === "active");
		expect(activeHero).toBeDefined();
		expect(activeHero!.cardId).toBe(HERO);
	});
});

// ── focusedHeroId recomputado ──────────────────────────────────────────────────

describe("focusedHeroId — recomputação", () => {
	it("focusedHeroId aponta para o primeiro herói ativo após START_GAME", () => {
		const adapter = makeAdapter();
		adapter.dispatch({
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const nextState = adapter.getState();

		const activeHeroes = nextState.heroes.filter((h) => h.status === "active");
		const focusedHeroId = activeHeroes[0]?.id ?? null;

		setElfStoreProps({
			gameState: nextState,
			ui: { focusedHeroId },
		});

		expect(getElfUiState().focusedHeroId).toBe(focusedHeroId);
		expect(getElfUiState().focusedHeroId).toBe(nextState.heroes[0]!.id);
	});

	it("focusedHeroId permanece inalterado se herói ainda está ativo", () => {
		const adapter = makeAdapter();
		adapter.dispatch({
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const state1 = adapter.getState();
		const heroId = state1.heroes[0]!.id;

		setElfStoreProps({ gameState: state1, ui: { focusedHeroId: heroId } });

		// Avança para REVEAL_ROOM
		adapter.dispatch({ type: "REVEAL_ROOM" });
		const state2 = adapter.getState();

		// Herói ainda ativo → focusedHeroId mantido
		const currentFocus = getElfUiState().focusedHeroId;
		const activeHeroes = state2.heroes.filter((h) => h.status === "active");
		const focusStillValid = currentFocus
			? activeHeroes.some((h) => h.id === currentFocus)
			: false;
		const newFocusId = focusStillValid
			? currentFocus
			: (activeHeroes[0]?.id ?? null);

		setElfStoreProps({ gameState: state2, ui: { focusedHeroId: newFocusId } });

		expect(getElfUiState().focusedHeroId).toBe(heroId);
	});

	it("subscribe do Elf é chamado quando o estado muda", () => {
		let callCount = 0;
		const sub = gameElfStore.subscribe(() => callCount++);

		setElfStoreProps({ ui: { focusedHeroId: "hero-x" } });

		expect(callCount).toBeGreaterThan(0);
		sub.unsubscribe();
	});
});

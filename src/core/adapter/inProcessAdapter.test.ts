import { describe, expect, it, vi } from "vitest";
import { reducer } from "../reducer/index";
import { createInitialGameState } from "../state/gameState";
import { createInProcessAdapter } from "./inProcessAdapter";
import { testEngine } from "@/core/__tests__/testEngine";
import { gameOf } from "../../engine/state";

const HERO = "hero_crimson_barbarian";

function buildInitial() {
	return createInitialGameState({ heroCardIds: [HERO] });
}

const START_ACTION = {
	type: "START_GAME" as const,
	payload: { heroCardIds: [HERO] },
};

// ── dispatch ──────────────────────────────────────────────────────────────────

describe("dispatch", () => {
	it("retorna o mesmo estado que o reducer puro retornaria", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);

		const adapterResult = await adapter.dispatch(START_ACTION);
		const reducerResult = reducer(testEngine, initial, START_ACTION);

		expect(gameOf(adapterResult).status).toBe(gameOf(reducerResult).status);
		expect(gameOf(adapterResult).heroes.length).toBe(gameOf(reducerResult).heroes.length);
		expect(gameOf(adapterResult).actionLog.length).toBe(gameOf(reducerResult).actionLog.length);
	});

	it("estado é atualizado sincronamente — getState() reflete novo estado antes de await", () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);

		// Não usamos await — o estado já deve estar atualizado
		adapter.dispatch(START_ACTION);
		expect(gameOf(adapter.getState()).status).toBe("ROOM_EFFECT");
	});

	it("múltiplos dispatches encadeiam o estado corretamente", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);

		await adapter.dispatch(START_ACTION);
		await adapter.dispatch({ type: "REVEAL_ROOM" });

		expect(gameOf(adapter.getState()).actionLog.length).toBe(2);
	});
});

// ── getState ──────────────────────────────────────────────────────────────────

describe("getState", () => {
	it("retorna estado inicial antes de qualquer dispatch", () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		expect(adapter.getState()).toBe(initial);
	});

	it("reflete o estado pós-último-dispatch", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);

		await adapter.dispatch(START_ACTION);
		expect(gameOf(adapter.getState()).status).toBe("ROOM_EFFECT");
		expect(adapter.getState()).not.toBe(initial);
	});
});

// ── subscribe / unsubscribe ───────────────────────────────────────────────────

describe("subscribe", () => {
	it("listener é chamado uma vez por dispatch com o novo estado", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		const listener = vi.fn();

		adapter.subscribe(listener);
		await adapter.dispatch(START_ACTION);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(adapter.getState());
	});

	it("listener recebe o estado atualizado (não o anterior)", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		let capturedState: typeof initial | null = null;

		adapter.subscribe((s) => {
			capturedState = s;
		});
		await adapter.dispatch(START_ACTION);

		expect(capturedState).not.toBeNull();
		expect(gameOf(capturedState!).status).toBe("ROOM_EFFECT");
	});

	it("múltiplos subscribers são todos chamados no dispatch", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		const l1 = vi.fn();
		const l2 = vi.fn();

		adapter.subscribe(l1);
		adapter.subscribe(l2);
		await adapter.dispatch(START_ACTION);

		expect(l1).toHaveBeenCalledTimes(1);
		expect(l2).toHaveBeenCalledTimes(1);
	});

	it("unsubscribe remove o listener — não é mais chamado após unsub", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		const listener = vi.fn();

		const unsub = adapter.subscribe(listener);
		unsub();
		await adapter.dispatch(START_ACTION);

		expect(listener).not.toHaveBeenCalled();
	});

	it("unsub de um listener não afeta outros subscribers", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		const l1 = vi.fn();
		const l2 = vi.fn();

		const unsub1 = adapter.subscribe(l1);
		adapter.subscribe(l2);
		unsub1();

		await adapter.dispatch(START_ACTION);

		expect(l1).not.toHaveBeenCalled();
		expect(l2).toHaveBeenCalledTimes(1);
	});

	it("subscrever o mesmo listener duas vezes o registra uma vez (Set dedup)", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(testEngine, initial);
		const listener = vi.fn();

		adapter.subscribe(listener);
		adapter.subscribe(listener); // mesmo listener

		await adapter.dispatch(START_ACTION);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

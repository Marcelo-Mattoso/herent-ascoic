// Testes do Passo 10 — Engine Adapter.
// Verifica: dispatch equivale ao reducer puro; subscribe/unsubscribe; getState; sincronia.

import { describe, expect, it, vi } from "vitest";
import { reducer } from "../reducer/index";
import { createInitialGameState } from "../state/gameState";
import { createInProcessAdapter } from "./inProcessAdapter";

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
		const adapter = createInProcessAdapter(initial);

		const adapterResult = await adapter.dispatch(START_ACTION);
		const reducerResult = reducer(initial, START_ACTION);

		expect(adapterResult.status).toBe(reducerResult.status);
		expect(adapterResult.heroes.length).toBe(reducerResult.heroes.length);
		expect(adapterResult.actionLog.length).toBe(reducerResult.actionLog.length);
	});

	it("estado é atualizado sincronamente — getState() reflete novo estado antes de await", () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);

		// Não usamos await — o estado já deve estar atualizado
		adapter.dispatch(START_ACTION);
		expect(adapter.getState().status).toBe("REVEAL_ROOM");
	});

	it("múltiplos dispatches encadeiam o estado corretamente", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);

		await adapter.dispatch(START_ACTION);
		await adapter.dispatch({ type: "REVEAL_ROOM" });

		expect(adapter.getState().actionLog.length).toBe(2);
	});
});

// ── getState ──────────────────────────────────────────────────────────────────

describe("getState", () => {
	it("retorna estado inicial antes de qualquer dispatch", () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);
		expect(adapter.getState()).toBe(initial);
	});

	it("reflete o estado pós-último-dispatch", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);

		await adapter.dispatch(START_ACTION);
		expect(adapter.getState().status).toBe("REVEAL_ROOM");
		expect(adapter.getState()).not.toBe(initial);
	});
});

// ── subscribe / unsubscribe ───────────────────────────────────────────────────

describe("subscribe", () => {
	it("listener é chamado uma vez por dispatch com o novo estado", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);
		const listener = vi.fn();

		adapter.subscribe(listener);
		await adapter.dispatch(START_ACTION);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(adapter.getState());
	});

	it("listener recebe o estado atualizado (não o anterior)", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);
		let capturedState: typeof initial | null = null;

		adapter.subscribe((s) => {
			capturedState = s;
		});
		await adapter.dispatch(START_ACTION);

		expect(capturedState).not.toBeNull();
		expect(capturedState!.status).toBe("REVEAL_ROOM");
	});

	it("múltiplos subscribers são todos chamados no dispatch", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);
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
		const adapter = createInProcessAdapter(initial);
		const listener = vi.fn();

		const unsub = adapter.subscribe(listener);
		unsub();
		await adapter.dispatch(START_ACTION);

		expect(listener).not.toHaveBeenCalled();
	});

	it("unsub de um listener não afeta outros subscribers", async () => {
		const initial = buildInitial();
		const adapter = createInProcessAdapter(initial);
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
		const adapter = createInProcessAdapter(initial);
		const listener = vi.fn();

		adapter.subscribe(listener);
		adapter.subscribe(listener); // mesmo listener

		await adapter.dispatch(START_ACTION);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

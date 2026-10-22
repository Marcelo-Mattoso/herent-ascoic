import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "../state/gameState";
import { localStoragePersistence } from "./localStoragePersistence";

vi.mock("../config/defaults", async (importOriginal) => {
	const original = await importOriginal<typeof import("../config/defaults")>();
	return { ...original, FEATURE_FLAGS: { ...original.FEATURE_FLAGS, enableSave: true } };
});

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

describe("persistência local quando habilitada", () => {
	it("salva e limpa snapshot e log sem duplicar o actionLog no snapshot", () => {
		const state = createInitialGameState({ heroCardIds: [] });
		localStoragePersistence.saveSnapshot(state);
		expect(localStoragePersistence.loadSnapshot()?.status).toBe("MAIN_MENU");
		expect(JSON.parse(values.get("ascensao_heroica_snapshot") ?? "null")).not.toHaveProperty("actionLog");

		const entry = { seq: 0, action: { type: "START_GAME" as const, payload: { heroCardIds: ["hero_crimson_barbarian"] } } };
		localStoragePersistence.appendAction(entry);
		expect(localStoragePersistence.loadActionLog()).toEqual([entry]);
		localStoragePersistence.clearActionLog();
		localStoragePersistence.clearSnapshot();
		expect(localStoragePersistence.loadActionLog()).toEqual([]);
		expect(localStoragePersistence.loadSnapshot()).toBeNull();
	});

	it("ignora JSON corrompido e armazenamento indisponível", () => {
		values.set("ascensao_heroica_snapshot", "{");
		expect(localStoragePersistence.loadSnapshot()).toBeNull();
		vi.stubGlobal("localStorage", {
			getItem: () => { throw new Error("blocked"); },
			setItem: () => { throw new Error("blocked"); },
			removeItem: () => { throw new Error("blocked"); },
		});
		expect(localStoragePersistence.loadActionLog()).toEqual([]);
		expect(() => localStoragePersistence.clearSnapshot()).not.toThrow();
	});
});

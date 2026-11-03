import ts from "typescript";
import { createInitialGameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";
import { describe, expect, it } from "vitest";
import {
	directAccessReport,
	OWNER_ALLOWLIST,
	statComponentHits,
} from "./accessScan";

describe("acesso direto a campos do GameState", () => {
	it("engine (zonas/contadores) e world só são tocados em access.ts e módulos donos", () => {
		const report = directAccessReport();
		expect(report.hits).toEqual([]);
		expect(report.total).toBe(0);
	}, 60_000);

	it("a raiz é {engine, game} e TGame não guarda pendências, pausa, pilha, decks nem despertar", () => {
		const state = createInitialGameState({ heroCardIds: [] });
		expect(Object.keys(state).sort()).toEqual(["engine", "game"]);
		const keys = Object.keys(gameOf(state));
		for (const gone of [
			"engine",
			"effectStack",
			"paused",
			"pendingSkillTarget",
			"pendingSkillChoice",
			"pendingTriggerInterrupt",
			"pendingSkillWindow",
			"decks",
			"despertar",
		]) {
			expect(keys).not.toContain(gone);
		}
		expect(Object.keys(state.engine)).toEqual(
			expect.arrayContaining(["stack", "counters", "zones"]),
		);
	});

	it("a allowlist é mínima e cada entrada tem motivo", () => {
		expect(Object.keys(OWNER_ALLOWLIST).sort()).toEqual([
			"src/core/reducer/utils.ts",
			"src/core/state/access.ts",
			"src/core/state/gameState.ts",
		]);
		for (const reason of Object.values(OWNER_ALLOWLIST)) {
			expect(reason.length).toBeGreaterThan(10);
		}
	});

	it("vida e atributos de combate: componentes do ECS só em access.ts e src/core/ecs", () => {
		const scan = (text: string) =>
			statComponentHits(
				ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true),
				"x.ts",
			).length;
		expect(scan('getComponent(world, id, "health")')).toBe(1);
		expect(scan('updateComponent(world, id, "damage_stat", (c) => c)')).toBe(1);
		expect(scan('const c = { type: "dice", count: 2 };')).toBe(1);
		expect(scan('getComponent(world, id, "modifier")')).toBe(0);
		expect(scan('const c = { type: "trigger" };')).toBe(0);
	});
});

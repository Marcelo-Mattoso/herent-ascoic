// Fase 7: handleScript removido; testa o subsistema de scripts via getScript direto.

import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";
import { createInitialGameState } from "../../state/gameState";

const baseCtx: SkillContext = { triggeredBy: "on_use" };

describe("subsistema de scripts — end-to-end", () => {
	it("ping escreve no eventLog via ctx.log", () => {
		const state = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const fn = getScript("_smoke_test.ping");
		expect(fn).toBeDefined();
		const next = fn!(buildScriptCtx(state, baseCtx));
		const lastEntry = next.eventLog[next.eventLog.length - 1];
		expect(lastEntry).toContain("[script smoke] ping executado");
	});

	it("getScript retorna null para ref inexistente", () => {
		const fn = getScript("inexistente.fn");
		expect(fn).toBeNull();
	});
});

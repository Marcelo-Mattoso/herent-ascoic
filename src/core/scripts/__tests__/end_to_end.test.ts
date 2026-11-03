import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { buildScriptCtx } from "../../scripts/context";
import { scriptOf } from "@/core/gameEngine";
import { createInitialGameState } from "../../state/gameState";
import { testEngine } from "@/core/__tests__/testEngine";
import { gameOf } from "../../../engine/state";

const baseCtx: SkillContext = { triggeredBy: "on_use" };

describe("subsistema de scripts — end-to-end", () => {
	it("ping escreve no eventLog via ctx.log", () => {
		const state = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const fn = scriptOf(testEngine, "_smoke_test.ping");
		expect(fn).toBeDefined();
		const next = fn!(buildScriptCtx(testEngine, state, baseCtx));
		const lastEntry = gameOf(next).eventLog[gameOf(next).eventLog.length - 1];
		expect(lastEntry).toContain("[script smoke] ping executado");
	});

	it("getScript retorna null para ref inexistente", () => {
		const fn = scriptOf(testEngine, "inexistente.fn");
		expect(fn).toBeNull();
	});
});

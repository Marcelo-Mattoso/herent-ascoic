import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { createInitialGameState } from "@/core/state/gameState";
import { withGame, gameOf } from "@/engine/state";
import { progressionHandler, handleSpendXp } from "./progression";

describe("compras de XP sem baralho disponível", () => {
	it("não cobra item quando o baralho está vazio", () => {
		const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = withGame(initial, (game) => ({ ...game,
			status: "XP_SPEND_PHASE", groupXp: 100,
		}));
		const next = handleSpendXp(testEngine, state, "buy_item");
		expect(gameOf(next).groupXp).toBe(100);
		expect(progressionHandler.legalActions(state, "", testEngine).some((action) =>
			action.type === "SPEND_XP" && action.payload.option === "buy_item")).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settledWith } from "@/core/__tests__/fixtures";
import { createEmptyCombatState } from "@/core/state/combatState";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { applyDamageOverTimeStatus } from "@/core/rules/damageOverTime";
import { observe } from "./observe";
import { scoreMoves } from "./brain";

/**
 * Bot integration belongs under tools, not src: the bot's transitive
 * dependencies include Node-only modules used by the golden replay suite.
 * Importing those from src/*.test.ts makes the browser tsconfig pull in
 * node:crypto during `tsc -b`.
 */
function poisonedArtifactCombat(): GameState {
	const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
	let state = settledWith(initial, {
		status: "HERO_ACTION",
		groupArtifacts: [{ cardId: "artifact_corrupted_forest_heart", carriedBy: null }],
		heroes: [{
			id: "h1", cardId: "hero_crimson_barbarian", maxLife: 30,
			currentLife: 20, damage: 3, hitBonus: 0, dice: 2,
			activeItems: {}, backpack: [], usedPowers: {}, conditions: [],
			status: "active", playerIndex: 0, xp: 0,
		}],
		activeEnemies: [{
			id: "e1", cardId: "creature_dark_cave_goblin",
			maxLife: 30, currentLife: 30, damage: 1, hitBonus: 0, dice: 1,
			tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active",
		}],
		combat: createEmptyCombatState(),
	});
	for (let index = 0; index < 3; index++) {
		state = applyDamageOverTimeStatus(state, "e1", {
			status: "poison", sourceId: "h1",
			effectId: "bot-artifact-poison-" + index,
			damage: 1, rounds: 3,
		});
	}
	return state;
}

describe("bot artifact integration", () => {
	it("não oferece ação manual do Coração Corrompido mesmo com veneno no inimigo", () => {
		const observation = observe(testEngine, poisonedArtifactCombat());
		const actions = observation.actions.filter((action) => action.type === "USE_ARTIFACT");
		expect(actions).toHaveLength(0);
		expect(scoreMoves(observation, "power-player").some((move) =>
			move.action.type === "USE_ARTIFACT")).toBe(false);
	});
});

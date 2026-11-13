import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settledWith } from "@/core/__tests__/fixtures";
import { createEmptyCombatState } from "@/core/state/combatState";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { legalArtifactActions, projectManualArtifactActions } from "./artifactActivation";

function scene(artifactId = "artifact_corrupted_forest_heart"): GameState {
	const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
	return settledWith(initial, {
		status: "HERO_ACTION",
		groupArtifacts: [{ cardId: artifactId, carriedBy: null }],
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
}


describe("uso manual dos artefatos no jogo e bot", () => {
	it("Coração Corrompido vira passivo e não oferece botão de uso", () => {
		expect(projectManualArtifactActions(testEngine, scene())).toHaveLength(0);
		expect(legalArtifactActions(testEngine, scene())).toEqual([]);
		expect(projectManualArtifactActions(testEngine, scene("artifact_ancient_cauldron_spoon"))).toHaveLength(0);
	});

	it("oferece o Braseiro da Fornalha com alvo herói, mesmo sem portador definido", () => {
		const state = scene("artifact_last_vigil_brazier");
		const manual = projectManualArtifactActions(testEngine, state);
		expect(manual).toHaveLength(1);
		expect(manual[0]).toMatchObject({ available: true, requiresTarget: true,
			abilityId: "power_greater_last_light_miracle",
			targets: [{ id: "h1", kind: "hero" }] });
		expect(legalArtifactActions(testEngine, state)[0]).toMatchObject({
			type: "USE_ARTIFACT", payload: { targetHeroId: "h1" },
		});
	});

});

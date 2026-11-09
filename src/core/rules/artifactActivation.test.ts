import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled } from "@/core/__tests__/fixtures";
import { createEmptyCombatState } from "@/core/state/combatState";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { enemiesOf } from "@/core/state/access";
import { withGame } from "@/engine/state";
import { legalActions } from "@/core/legalActions";
import { artifactHandler } from "@/core/reducer/artifact";
import { applyDamageOverTimeStatus } from "./damageOverTime";
import { legalArtifactActions, projectManualArtifactActions } from "./artifactActivation";
import { observe } from "../../../tools/bot/observe";
import { scoreMoves } from "../../../tools/bot/brain";

function scene(artifactId = "artifact_corrupted_forest_heart"): GameState {
	const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
	return settled(withGame(initial, (game) => ({
		...game,
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
	})));
}

function poisoned(state: GameState, stacks = 2): GameState {
	let next = state;
	for (let index = 0; index < stacks; index++) {
		next = applyDamageOverTimeStatus(next, "e1", {
			status: "poison", sourceId: "h1", effectId: "poison-source-" + index,
			damage: 1, rounds: 3,
		});
	}
	return next;
}

describe("uso manual dos artefatos no jogo e bot", () => {
	it("não oferece Coração Corrompido sem veneno; passivos não têm Usar", () => {
		const empty = scene();
		const view = projectManualArtifactActions(testEngine, empty);
		expect(view).toHaveLength(1);
		expect(view[0]).toMatchObject({ artifactId: "artifact_corrupted_forest_heart",
			available: false });
		expect(view[0]?.reason).toMatch(/envenenado/);
		expect(legalArtifactActions(testEngine, empty)).toEqual([]);
		const passive = projectManualArtifactActions(testEngine, scene("artifact_ancient_cauldron_spoon"));
		expect(passive).toHaveLength(0);
	});

	it("mostra alvos válidos, aplica explosão dos stacks e respeita uma vez por combate", () => {
		const start = poisoned(scene(), 2);
		const view = projectManualArtifactActions(testEngine, start);
		expect(view[0]).toMatchObject({ available: true, requiresTarget: true,
			targets: [{ id: "e1", kind: "enemy" }] });
		const options = legalActions(testEngine, start).filter((action) => action.type === "USE_ARTIFACT");
		expect(options).toHaveLength(1);
		expect(options[0]).toMatchObject({ type: "USE_ARTIFACT", payload: {
			artifactId: "artifact_corrupted_forest_heart",
			abilityId: "witch_artifact_corrupted_heart_burst",
			targetEnemyId: "e1",
		} });
		const after = artifactHandler.apply(start, options[0]!, testEngine);
		expect(enemiesOf(after)[0]?.currentLife).toBe(26);
		expect(enemiesOf(after)[0]?.conditions.some((condition) => condition.includes("poison"))).toBe(false);
		expect(legalArtifactActions(testEngine, poisoned(after, 1))).toHaveLength(0);
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

	it("bot observa e pontua a mesma ação legal que a UI mostra", () => {
		const start = poisoned(scene(), 3);
		const observation = observe(testEngine, start);
		const actions = observation.actions.filter((action) => action.type === "USE_ARTIFACT");
		expect(actions).toHaveLength(1);
		expect(scoreMoves(observation, "power-player").some((move) =>
			move.action.type === "USE_ARTIFACT" && move.score >= 150)).toBe(true);
	});

	it("recusa alvo inventado e respeita bloqueios fora da janela de ação", () => {
		const start = poisoned(scene(), 2);
		const invalid = artifactHandler.apply(start, { type: "USE_ARTIFACT", payload: {
			artifactId: "artifact_corrupted_forest_heart",
			abilityId: "witch_artifact_corrupted_heart_burst", targetEnemyId: "absent",
		} }, testEngine);
		expect(enemiesOf(invalid)[0]?.currentLife).toBe(30);
		const betweenRounds = withGame(start, (game) => ({
			...game, combat: { ...game.combat!, phase: "round_end" as const },
		}));
		expect(legalArtifactActions(testEngine, betweenRounds)).toEqual([]);
	});
});

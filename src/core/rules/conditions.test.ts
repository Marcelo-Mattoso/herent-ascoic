import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../state/gameState";
import { checkBossCondition } from "./conditions";

const BOSS = "boss_azhakar";

function stateWithArtifacts(count: number) {
	const state = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	const artifacts = Array.from({ length: count }, (_, i) => ({
		cardId: `artifact_test_${i + 1}`,
		carriedBy: null,
	}));
	return { ...state, groupArtifacts: artifacts };
}

describe("checkBossCondition — Azhakar", () => {
	it("0 artefatos: condição não atendida", () => {
		expect(checkBossCondition(stateWithArtifacts(0), BOSS)).toBe(false);
	});

	it("1 artefato: condição não atendida", () => {
		expect(checkBossCondition(stateWithArtifacts(1), BOSS)).toBe(false);
	});

	it("2 artefatos: condição atendida", () => {
		expect(checkBossCondition(stateWithArtifacts(2), BOSS)).toBe(true);
	});

	it("3 artefatos: condição atendida", () => {
		expect(checkBossCondition(stateWithArtifacts(3), BOSS)).toBe(true);
	});

	it("boss desconhecido retorna false", () => {
		expect(checkBossCondition(stateWithArtifacts(3), "boss_unknown")).toBe(
			false,
		);
	});
});

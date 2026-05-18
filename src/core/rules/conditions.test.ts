import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../state/gameState";
import { checkBossCondition } from "./conditions";

const BOSS = "Azhakar, Dragão da Fornalha Sombria";

function stateWithArtifacts(count: number) {
	const state = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	const artifacts = Array.from({ length: count }, (_, i) => ({
		cardName: `Artefato ${i + 1}`,
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
		expect(checkBossCondition(stateWithArtifacts(3), "Boss Desconhecido")).toBe(
			false,
		);
	});
});

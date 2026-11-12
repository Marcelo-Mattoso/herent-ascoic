import { describe, expect, it } from "vitest";
import { runRuntimeScenarios } from "./runtime";
import { runGroupCombatScenarios } from "./groupRuntime";

describe("auditoria de Marca da Presa — seleção por quantidade de inimigos", () => {
	it("aceita alvo único automático e exige escolha entre dois alvos", () => {
		const result = runRuntimeScenarios().find((entry) => entry.id === "hunter-prey-mark");
		expect(result).toBeDefined();
		expect(result?.status, result?.detail).toBe("PASS");
	});

	it.each([2, 3, 4])("não reprova seleção de alvo com %i heróis", (size) => {
		const result = runGroupCombatScenarios().find((entry) => entry.partySize === size);
		expect(result).toBeDefined();
		expect(result?.status, result?.detail).toBe("PASS");
	});
});

import { describe, expect, it } from "vitest";
import { auditEngine, combat, runRuntimeScenarios } from "./runtime";
import { runHeroCoverageScenarios } from "./heroRuntime";

describe("skill audit P0: ativação, confirmação e custo dos poderes", () => {
	it("valida os sete poderes sem confundir escolha pendente com uso consumido", () => {
		const powerResults = runRuntimeScenarios().filter((scenario) =>
			scenario.id.startsWith("power-activation-"));
		expect(powerResults).toHaveLength(7);
		for (const result of powerResults) {
			expect(result.status, `${result.id}: ${result.detail}`).toBe("PASS");
		}
	});
});

describe("skill audit P0: cobertura funcional dos heróis", () => {
	const results = runHeroCoverageScenarios(auditEngine, combat);

	it("inclui 15 concessões antes sem cobertura e 7 extensões de poderes", () => {
		expect(results).toHaveLength(22);
		expect(new Set(results.map((scenario) => scenario.id)).size).toBe(22);
		expect(results.filter((scenario) => scenario.id.includes("-preparation"))).toHaveLength(4);
	});

	it.each([
		"hero-cleric-healing",
		"hero-mage-rift-rune",
		"hero-necromancer-return-rite",
		"hero-necromancer-kill-echo",
		"hero-necromancer-spend-echo",
		"hero-green-eclipse-roll",
		"hero-white-ash-balm",
		"hero-white-ash-mercy",
	])("valida fluxo real %s", (id) => {
		const result = results.find((scenario) => scenario.id === id);
		expect(result).toBeDefined();
		expect(result?.status, result?.detail).toBe("PASS");
	});
});

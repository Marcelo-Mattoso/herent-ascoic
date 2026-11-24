import { describe, expect, it } from "vitest";
import { auditEngine, combat } from "./runtime";
import { runHeroCoverageScenarios } from "./heroRuntime";

describe("P1: efeitos e limites reais de poderes do herói", () => {
  it("cobre recuperação do Andarilho e limites de poderes de cura", () => {
    const cases = runHeroCoverageScenarios(auditEngine, combat);
    for (const id of [
      "hero-plains-power-recovery",
      "hero-white-ash-mercy",
      "hero-cleric-miracle-effect",
      "hero-paladin-oath-effect",
    ]) {
      const result = cases.find(row => row.id === id);
      expect(result, id + ": cenário ausente").toBeDefined();
      expect(result?.status, id + ": " + result?.detail).toBe("PASS");
    }
  });
});

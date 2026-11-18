import { describe, expect, it } from "vitest";
import { mcnemarStatistic, selectBonus } from "./statistics";
describe("validação A/B independente", () => {
  it("quatro ganhos em quarenta pares não comprovam melhoria estatística", () => {
    expect(mcnemarStatistic(4, 0)).toBeLessThan(6.64);
    expect(mcnemarStatistic(12, 1)).toBeGreaterThan(6.64);
  });
  it("prefere menor força quando desempenho é igual", () => {
    expect(selectBonus([
      { bonus: 140, wins: 5, violations: 0 },
      { bonus: 40, wins: 5, violations: 0 },
      { bonus: 90, wins: 4, violations: 0 },
    ])).toBe(40);
  });
  it("rejeita valores inválidos", () => {
    expect(() => mcnemarStatistic(-1, 1)).toThrow();
  });
});

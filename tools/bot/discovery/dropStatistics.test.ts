import { describe, expect, it } from "vitest";
import { observedFrequency } from "./dropStatistics";
describe("incidência de itens observados", () => {
  it("não inventa chance quando nenhuma carta foi observada", () => {
    expect(observedFrequency(0, 0)).toEqual({
      observations: 0, trials: 0, frequency: null, confidence95: null,
    });
  });
  it("constrói intervalo mais amplo para amostras pequenas", () => {
    const few = observedFrequency(1, 2);
    const many = observedFrequency(50, 100);
    expect(few.confidence95![1] - few.confidence95![0])
      .toBeGreaterThan(many.confidence95![1] - many.confidence95![0]);
  });
  it("rejeita dados impossíveis", () => {
    expect(() => observedFrequency(3, 2)).toThrow();
  });
});

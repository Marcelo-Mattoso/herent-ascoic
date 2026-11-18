import { describe, expect, it } from "vitest";
import { catalogFingerprint } from "./fingerprint";
describe("proveniência do conhecimento", () => {
  it("gera identificador determinístico não vazio do catálogo habilitado", () => {
    const first = catalogFingerprint();
    expect(first).toMatch(/^catalog-v3-[0-9a-f]{16}$/);
    expect(catalogFingerprint()).toBe(first);
  });
});

import { describe, expect, it } from "vitest";
import baseline from "./coverageBaseline.json";
import { discoverAbilityInventory } from "./catalog";

describe("baseline de cobertura incremental", () => {
  it("congela as concessões existentes sem cobrir ficticiamente novas", () => {
    const keys = discoverAbilityInventory().map(entry => entry.sourceCardId + "::" + entry.grantId);
    expect(baseline.grants).toHaveLength(311);
    expect(new Set(baseline.grants).size).toBe(311);
    // Grants novos são permitidos, desde que recebam prova no auditor.
    expect(baseline.grants.every(key => keys.includes(key))).toBe(true);
  });
});

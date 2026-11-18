import { describe, expect, it } from "vitest";
import { effectKinds } from "@/core/abilities/trace";
import { runAutoContractProbes } from "./autoContracts";

describe("contratos automáticos de habilidades", () => {
  it("visita efeitos aninhados sem depender do ID da carta", () => {
    expect(effectKinds([{ kind: "i_if",
      when: { kind: "compare", op: "gte", left: 1, right: 0 },
      then: [{ kind: "i_heal", to: "$self", amount: 2 }],
      else: [{ kind: "i_damage", to: "$target", amount: 1 }],
    }])).toEqual(["i_if", "i_heal", "i_damage"]);
  });

  it("descobre e exercita grants dos chefes habilitados", () => {
    const results = runAutoContractProbes();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(row => row.grantId && row.abilityId)).toBe(true);
    // Sem falsos PASS: a ausência de fixture permanece NOT_COVERED.
    expect(results.every(row => ["PASS", "FAIL", "NOT_COVERED"].includes(row.status))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { AuditReport } from "./catalog";
import { auditBlockers } from "./health";

function emptyReport(): AuditReport {
	return {
		version: 1, generatedAt: "2026-11-12T00:00:00.000Z",
		summary: { discoveredGrants: 1, uniqueAbilities: 1,
			structuralPass: 1, structuralFail: 0, runtimePass: 0,
			runtimeFail: 0, runtimeNotCovered: 1, runtimePartial: 0,
			groupProjectionPass: 0, groupProjectionFail: 0, groupCombatPartial: 0, groupCombatFail: 0 },
		inventory: [], findings: [], groupInteractions: [],
		runtimeScenarios: [], groupProjectionScenarios: [], groupCombatScenarios: [],
	};
}

describe("gate P0 da auditoria", () => {
	it("não bloqueia por cobertura parcial ou inexistente, que continuam visíveis", () => {
		expect(auditBlockers(emptyReport())).toEqual([]);
	});

  it("impede concessão inédita sem qualquer cenário, mas tolera o legado", () => {
    const base = emptyReport();
    const entry = {
      sourceCardId: "hero_futuro", sourceType: "hero", expansion: "futura-expansao",
      abilityId: "skill_nova", grantId: "g-nova", activation: "manual",
      event: null, actionCost: "none", cost: null, limit: null,
      effect: "dsl", runtimeStatus: "NOT_COVERED" as const,
      reason: "Sem fixture",
    };
    expect(auditBlockers({ ...base, inventory: [entry] }).join("|"))
      .toContain("NEW_GRANT_UNCOVERED");
    expect(auditBlockers({ ...base, inventory: [{ ...entry, runtimeStatus: "PARTIAL" }] }))
      .toEqual([]);
  });

	it("bloqueia falhas estruturais, de runtime e em grupos sem omitir detalhes", () => {
		const base = emptyReport();
		const result: AuditReport = {
			...base,
			findings: [{ code: "event_emitter", status: "FAIL", sourceCardId: "hero",
				abilityId: "skill", grantId: "g", detail: "Emissor ausente" }],
			runtimeScenarios: [{ id: "runtime-x", sourceCardId: "hero",
				abilityId: "skill", status: "FAIL", detail: "Dado incorreto" }],
			groupProjectionScenarios: [{ id: "party-3", partySize: 3,
				heroCardIds: ["a","b","c"], seed: 10, status: "FAIL", detail: "Sem ação" }],
			groupCombatScenarios: [{ partySize: 2, heroCardIds: ["a","b"], abilityIds: ["x","y"],
				status: "FAIL", detail: "Interferência" }],
		};
		expect(auditBlockers(result)).toHaveLength(4);
		expect(auditBlockers(result).join("|")).toContain("Interferência");
	});
});

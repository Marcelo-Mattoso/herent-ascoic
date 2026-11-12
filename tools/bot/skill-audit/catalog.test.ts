import { describe, expect, it } from "vitest";
import { getAllCards } from "../../../src/core/data/cards";
import { cardAbilityGrants } from "../../../src/core/data/abilities";
import { auditDefinitions, createSkillAuditReport, discoverAbilityInventory, discoverGroupCandidates } from "./catalog";

describe("skill audit: discovery and structural checks", () => {
	it("discovers every grant in every enabled card without a hardcoded skill list", () => {
		const inventory = discoverAbilityInventory();
		const total = getAllCards().reduce((sum, card) => sum + cardAbilityGrants(card.id).length, 0);
		expect(inventory.length).toBe(total);
		expect(inventory.length).toBeGreaterThan(0);
		expect(new Set(inventory.map((entry) => entry.grantId + "::" + entry.sourceCardId)).size).toBe(total);
	});

	it("keeps runtime uncovered until actual execution is verified", () => {
		const report = createSkillAuditReport("2026-11-12T00:00:00.000Z");
		expect(report.summary.runtimePass).toBe(0);
		expect(report.summary.runtimePass).toBe(0);
		expect(report.summary.runtimeNotCovered + report.summary.runtimePartial + report.summary.runtimeFail)
			.toBe(report.summary.discoveredGrants);
		expect(report.runtimeScenarios).toHaveLength(10);
		expect(report.groupProjectionScenarios.length).toBeGreaterThanOrEqual(48);
		expect(report.groupCombatScenarios.map((entry) => entry.partySize)).toEqual([2, 3, 4]);
		expect(report.inventory.map((entry) => entry.runtimeStatus)).not.toContain("PASS");
		expect(report.generatedAt).toBe("2026-11-12T00:00:00.000Z");
	});

	it("detects a missing effect and an unknown event emitter", () => {
		const example = discoverAbilityInventory()[0]!;
		const findings = auditDefinitions([{ ...example, effect: "missing",
			activation: "event", event: "__missing_event__" }]);
		expect(findings).toContainEqual(expect.objectContaining({
			code: "definition_exists", status: "FAIL",
		}));
		expect(findings).toContainEqual(expect.objectContaining({
			code: "event_emitter", status: "FAIL",
		}));
	});

	it("enumerates group candidates for two, three and four heroes", () => {
		const candidates = discoverGroupCandidates(discoverAbilityInventory());
		expect(candidates.map((entry) => entry.partySize)).toEqual([2, 3, 4]);
		for (const candidate of candidates) {
			expect(candidate.sourceCardIds).toHaveLength(candidate.partySize);
			expect(candidate.status).toBe("NOT_COVERED");
		}
	});
});

import { describe, expect, it } from "vitest";
import { getEnabledExpansions } from "@/core/data/expansions";
import { compareSnapshots, expansionAuditPaths, parseExpansionAuditArgs } from "./expansionAudit";

const expansion = getEnabledExpansions()[0]!.id;

describe("expansion audit: CLI and report comparison", () => {
	it("uses repeatable defaults and accepts a preview", () => {
		const options = parseExpansionAuditArgs([
			"--phase", "opening", "--expansion", expansion, "--dry-run",
		]);
		expect(options).toMatchObject({
			phase: "opening", expansion, dryRun: true, runs: 10, seed: 1,
		});
		expect(expansionAuditPaths(options).leveling).toContain("opening-leveling");
	});

	it("keeps opening and closing artifacts separate", () => {
		const opening = expansionAuditPaths({ expansion, phase: "opening" });
		const closing = expansionAuditPaths({ expansion, phase: "closing" });
		expect(opening.manifest).not.toBe(closing.manifest);
		expect(opening.skills).not.toBe(closing.skills);
	});

	it("rejects invalid phase, unknown expansion and unsafe seeds", () => {
		expect(() => parseExpansionAuditArgs([
			"--phase", "done", "--expansion", expansion,
		])).toThrow();
		expect(() => parseExpansionAuditArgs([
			"--phase", "closing", "--expansion", "../invalid",
		])).toThrow();
		expect(() => parseExpansionAuditArgs([
			"--phase", "opening", "--expansion", expansion, "--runs", "10", "--seed", "2147483647",
		])).toThrow();
	});

	it("flags mismatched configurations rather than treating differences as regressions", () => {
		const initial = {
			phase: "opening" as const, expansion, generatedAt: "2026-11-12T00:00:00.000Z",
			configuration: { runs: 10, seed: 1, maxSteps: 1000 },
			reports: { skills: "", catalog: "", leveling: "" },
			skillSummary: { structuralFail: 2, runtimeNotCovered: 10 },
			levelingSummary: { completed: 2, expected: 2, outcomes: { WIN: 1, LOSS: 1 }, byCase: [] },
			limitations: [],
		};
		const final = { ...initial, phase: "closing" as const,
			configuration: { ...initial.configuration, seed: 20 },
			skillSummary: { structuralFail: 1, runtimeNotCovered: 10 },
			levelingSummary: { completed: 2, expected: 2, outcomes: { WIN: 2 }, byCase: [] },
		};
		const compared = compareSnapshots(initial, final);
		expect(compared.comparable).toBe(false);
		expect(compared.outcomes.WIN.change).toBe(1);
	});
});

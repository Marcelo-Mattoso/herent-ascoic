import { describe, expect, it } from "vitest";
import type { BenchmarkTrial, ProgressionTelemetry } from "./dungeonBenchmark";
import { summarizeReportDiagnostics } from "./reportDiagnostics";

function trial(difficulty: BenchmarkTrial["difficulty"], seed = 1,
	outcome = "DEFEAT", progression?: Partial<ProgressionTelemetry>): BenchmarkTrial {
	return {
		seed, repetition: 0, expansionId: "fornalha-sombria",
		heroId: "hero_crimson_barbarian", profile: "power-player",
		difficulty, outcome, violation: null, violationMessage: null,
		steps: 1, roomsCleared: 0, creaturesDefeated: 0,
		bossDefeated: false, artifacts: 0, skillUses: 0, powerUses: 0,
		...(progression ? { progression: progression as ProgressionTelemetry } : {}),
	};
}

describe("diagnósticos P0", () => {
	it("compara dificuldade por seed idêntica e agrega a atividade sem inferir triggers automáticos", () => {
		const summary = summarizeReportDiagnostics([
			trial("hard", 1, "DEFEAT", {
				xpGained: 10, xpSpent: 8, xpOtherLoss: 0, xpFinal: 2,
				levelUpNoEffect: 0, abilityActivity: { preparationsById: { fury: 3 },
					manualActionsById: {}, powerActivationsById: {},
					triggersAcceptedById: {}, triggersSkippedById: {} },
			}),
			trial("nightmare", 1, "DEFEAT"),
			trial("normal", 2, "VICTORY"),
		]);
		expect(summary.games).toBe(3);
		expect(summary.xpAccountingMismatches).toBe(0);
		expect(summary.difficultyParity).toMatchObject({
			pairedGames: 1, sameOutcome: 1, sameOutcomeRate: 1,
		});
		expect(summary.abilityActivity).toContainEqual(expect.objectContaining({
			abilityId: "fury", preparations: 3, triggersAccepted: 0,
		}));
	});

	it("sinaliza XP incorreto e diferencia falha do bot de derrota", () => {
		const summary = summarizeReportDiagnostics([
			trial("normal", 3, "ERROR", { xpGained: 5, xpSpent: 2,
				xpOtherLoss: 0, xpFinal: 5, levelUpNoEffect: 1 }),
		]);
		expect(summary.errors).toBe(1);
		expect(summary.stalls).toBe(1);
		expect(summary.xpAccountingMismatches).toBe(1);
		expect(summary.ineffectiveLevelUpAttempts).toBe(1);
		expect(summary.warnings.length).toBeGreaterThanOrEqual(3);
	});
});

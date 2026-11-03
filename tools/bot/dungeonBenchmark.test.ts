import { describe, expect, it } from "vitest";
import {
	type BenchmarkTrial,
	benchmarkCaseKey,
	benchmarkPlan,
	classifyTrial,
	defaultBenchmarkOptions,
	ensureComparableDungeons,
	initialDungeonSignature,
	summarizeBenchmark,
} from "./dungeonBenchmark";
import {
	renderDungeonReportCsv,
	renderDungeonReportHtml,
	renderDungeonReportMarkdown,
} from "./dungeonReportHtml";

describe("ensaio pareado de masmorra", () => {
	it("monta 2.000 partidas por padrão: 10 seeds × 8 heróis × 5 perfis × 5 dificuldades", () => {
		const options = defaultBenchmarkOptions();
		const plan = benchmarkPlan(options);
		expect(plan).toHaveLength(2000);
		expect(new Set(plan.map(benchmarkCaseKey)).size).toBe(2000);
		for (let seed = options.seed; seed < options.seed + options.runs; seed++) {
			expect(plan.filter((item) => item.seed === seed)).toHaveLength(200);
		}
		expect(plan.every((item) => options.heroes.includes(item.heroId))).toBe(true);
	});

	it("mantém sala inicial, boss e ordem dos quatro decks iguais entre heróis e dificuldades", () => {
		const options = { ...defaultBenchmarkOptions(), runs: 1 };
		expect(() => ensureComparableDungeons(options)).not.toThrow();
		const first = initialDungeonSignature({
			seed: options.seed, heroId: options.heroes[0]!, difficulty: "normal",
		});
		const again = initialDungeonSignature({
			seed: options.seed, heroId: options.heroes[7]!, difficulty: "nightmare",
		});
		expect(again).toBe(first);
	}, 30_000);

	it("não confunde impasse com derrota e calcula médias por célula", () => {
		const options = { ...defaultBenchmarkOptions(), heroes: [defaultBenchmarkOptions().heroes[0]!],
			profiles: ["casual" as const], difficulties: ["normal" as const], runs: 3 };
		const plan = benchmarkPlan(options);
		const outcomes = ["VICTORY", "DEFEAT", "HERO_ACTION"];
		const trials: BenchmarkTrial[] = plan.map((test, index) => ({
			...test, outcome: outcomes[index]!,
			violation: index === 2 ? "max_steps_exceeded" : null,
			violationMessage: index === 2 ? "limite" : null,
			steps: 10 * (index + 1), roomsCleared: index + 1,
			creaturesDefeated: index, bossDefeated: index === 0,
			artifacts: index, skillUses: index + 1, powerUses: 0,
		}));
		expect(trials.map(classifyTrial)).toEqual(["victory", "defeat", "stall"]);
		const summaries = summarizeBenchmark(options, trials);
		expect(summaries).toHaveLength(1);
		expect(summaries[0]).toMatchObject({
			games: 3, victories: 1, defeats: 1, stalls: 1,
			victoryRate: 1 / 3, avgRooms: 2, avgSteps: 20, avgArtifacts: 1,
		});
		const report = { generatedAt: "2026-11-03T00:00:00.000Z", options,
			completed: trials.length, expected: trials.length, trials, summaries };
		const html = renderDungeonReportHtml(report);
		expect(html).toContain('id="matrix"');
		expect(html).toContain('id="profile-compare"');
		expect(html).toContain('id="trials"');
		expect(html).toContain("Masmorra igual");
		expect(renderDungeonReportCsv(trials).split("\n")).toHaveLength(5);
		expect(renderDungeonReportMarkdown(report)).toContain("Impasses");
	});
});

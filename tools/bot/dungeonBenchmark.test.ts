import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseDungeonReportArgs } from "./dungeonReport";
import { createHeadlessPort } from "./port";
import { setupForRun } from "./profiles";
import { benchmarkBoss } from "./dungeonBenchmark";
import { itemHealingAmount, healingMoveScore } from "./healing";
import { scoreMoves } from "./brain";
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
	it("descobre heróis e expansões e cruza todos com as seeds, perfis e dificuldades", () => {
		const options = defaultBenchmarkOptions();
		const plan = benchmarkPlan(options);
		expect(options.heroes.length).toBeGreaterThanOrEqual(12);
		expect(options.expansions).toEqual(expect.arrayContaining(["fornalha-sombria", "torre-grande-bruxa-caldeirao"]));
		const perSeed = options.heroes.length * options.expansions.length * options.profiles.length * options.difficulties.length;
		const expected = options.runs * perSeed;
		expect(plan).toHaveLength(expected);
		expect(new Set(plan.map(benchmarkCaseKey)).size).toBe(expected);
		for (let seed = options.seed; seed < options.seed + options.runs; seed++) {
			expect(plan.filter((item) => item.seed === seed)).toHaveLength(perSeed);
		}
		expect(plan.every((item) => options.heroes.includes(item.heroId) && options.expansions.includes(item.expansionId))).toBe(true);
	});

	it("usa Ímpeto inicial por dificuldade sem antecipar o Despertar da masmorra", () => {
		const expansionId = "torre-grande-bruxa-caldeirao";
		const heroId = "hero_crimson_barbarian";
		const expected = [
			["very_easy", 2],
			["easy", 1],
			["normal", 0],
			["hard", 0],
			["nightmare", 0],
		] as const;
		for (const [difficulty, impeto] of expected) {
			const setup = { ...setupForRun(1, [heroId], difficulty), bossCardId: benchmarkBoss(expansionId) };
			const view = createHeadlessPort(setup).observe().view;
			expect(view.heroes[0]?.impeto).toBe(impeto);
			expect(view.despertar).toBe(difficulty === "hard" || difficulty === "nightmare" ? 1 : 0);
		}
	});

	it("mantém sala inicial, boss e ordem dos quatro decks iguais entre heróis e dificuldades", () => {
		const options = { ...defaultBenchmarkOptions(), runs: 1 };
		expect(() => ensureComparableDungeons(options)).not.toThrow();
		const first = initialDungeonSignature({
			seed: options.seed, expansionId: options.expansions[0]!, heroId: options.heroes[0]!, difficulty: "normal",
		});
		const again = initialDungeonSignature({
			seed: options.seed, expansionId: options.expansions[0]!, heroId: options.heroes[7]!, difficulty: "nightmare",
		});
		expect(again).toBe(first);
		const witch = initialDungeonSignature({
			seed: options.seed, expansionId: options.expansions[1]!, heroId: options.heroes[7]!, difficulty: "normal",
		});
		expect(JSON.parse(witch).boss).not.toBe(JSON.parse(first).boss);
		expect(JSON.parse(witch).dungeon).not.toEqual(JSON.parse(first).dungeon);
	}, 30_000);

	it("não confunde impasse com derrota e calcula médias por célula", () => {
		const defaults = defaultBenchmarkOptions();
		const options = { ...defaults, heroes: [defaults.heroes[0]!],
			expansions: [defaults.expansions[0]!],
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
	it("reconhece curas pelo efeito do catálogo, não pela palavra poção", () => {
		expect(itemHealingAmount("item_lesser_vigor_potion")).toBe(2);
		expect(itemHealingAmount("item_greater_vigor_potion")).toBe(4);
		expect(itemHealingAmount("item_bitter_root_tonic")).toBe(2);
		expect(itemHealingAmount("item_moonwell_vial")).toBe(3);
		expect(itemHealingAmount("item_precision_potion")).toBeNull();
	});

	it("prioriza cura que impede morte e guarda poção quando o dano é pequeno", () => {
		const port = createHeadlessPort({ ...setupForRun(1, ["hero_eternal_rest_cleric"], "normal"),
			bossCardId: benchmarkBoss("fornalha-sombria") });
		const view = port.observe().view;
		const hero = view.heroes[0]!;
		const wounded = { ...view, heroes: [{ ...hero, currentLife: 1 }] };
		expect(healingMoveScore(wounded, hero.id, 4)).toBeGreaterThan(250);
		const scratch = { ...view, heroes: [{ ...hero, currentLife: hero.maxLife - 1 }] };
		expect(healingMoveScore(scratch, hero.id, 4)).toBeLessThan(100);
	});

	it("reconhece que Centelha e Eclipse são decisões pós-rolagem, não preparações prévias", () => {
		const port = createHeadlessPort({ ...setupForRun(1, ["hero_green_moon_sorceress"], "normal"),
			bossCardId: benchmarkBoss("torre-grande-bruxa-caldeirao") });
		const obs = port.observe();
		const hero = obs.view.heroes[0]!;
		const abilities = (obs.abilities[hero.id] ?? []).map((ability) => ({
			...ability, status: "available" as const,
		}));
		const ready = { ...obs, view: { ...obs.view, status: "HERO_ACTION" as const },
			abilities: { ...obs.abilities, [hero.id]: abilities } };
		const moves = scoreMoves(ready, "power-player");
		for (const skillId of ["witch_skill_lunar_spark", "witch_power_green_eclipse"]) {
			const move = moves.find((entry) => entry.action.type === "USE_SKILL" &&
				entry.action.payload.skillId === skillId);
			expect(move).toBeUndefined();
		}
	});

	it("não permite gerar relatórios de leveling parciais", () => {
		const defaults = defaultBenchmarkOptions();
		const options = parseDungeonReportArgs(["--runs", "2", "--seed", "17"]);
		expect(options.benchmark.heroes).toEqual(defaults.heroes);
		expect(options.benchmark.expansions).toEqual(defaults.expansions);
		expect(options.benchmark.profiles).toEqual(defaults.profiles);
		expect(options.benchmark.difficulties).toEqual(defaults.difficulties);
		expect(options.benchmark.runs).toBe(2);
		expect(options.benchmark.seed).toBe(17);
		for (const filter of ["--heroes", "--expansions", "--profiles", "--difficulties"]) {
			expect(() => parseDungeonReportArgs([filter, "foo"])).toThrow(/desconhecido/);
		}
	});

	it("filtra um herói e agrega vitórias de todos os perfis por dificuldade no HTML", () => {
		const defaults = defaultBenchmarkOptions();
		const options = {
			...defaults,
			runs: 1,
			heroes: defaults.heroes.slice(0, 2),
			profiles: ["casual", "power-player"] as const,
			difficulties: ["very_easy", "normal"] as const,
		};
		const trials: BenchmarkTrial[] = benchmarkPlan(options).map((test) => ({
			...test,
			outcome: test.heroId === options.heroes[0] &&
				(test.difficulty === "normal" || test.profile === "power-player") ? "DEFEAT" : "VICTORY",
			violation: null,
			violationMessage: null,
			steps: 15,
			roomsCleared: 2,
			creaturesDefeated: 1,
			bossDefeated: false,
			artifacts: 0,
			skillUses: 0,
			powerUses: 0,
		}));
		const summaries = summarizeBenchmark(options, trials);
		const html = renderDungeonReportHtml({
			generatedAt: "2026-11-03T00:00:00.000Z", options,
			completed: trials.length, expected: trials.length, trials, summaries,
		});
		expect(html).toContain('<select id="hero">');
		expect(html).toContain("Todos os perfis (agregado)");
		const script = /<script>\s*([\s\S]*?)<\/script>/.exec(html)?.[1];
		expect(script).toBeDefined();
		const listeners = new Map<string, () => void>();
		const elements = new Map(
			["dataset", "hero", "profile", "difficulty", "expansion", "expansion-compare", "matrix", "matrix-head",
				"metrics", "profile-compare", "trials", "metadata"].map((id) => [
					id,
					{
						value: "all",
						innerHTML: "",
						textContent: id === "dataset" ? JSON.stringify({
							generatedAt: "2026-11-03T00:00:00.000Z", options,
							completed: trials.length, expected: trials.length, trials, summaries,
						}) : "",
						addEventListener: (event: string, callback: () => void) =>
							listeners.set(id + ":" + event, callback),
					},
				] as const),
		);
		const get = (id: string) => {
			const element = elements.get(id);
			if (!element) throw new Error("Elemento não encontrado: " + id);
			return element;
		};
		runInNewContext(script!, { document: { getElementById: get } });
		expect(get("matrix").innerHTML).toContain("50.0%");
		expect(get("expansion-compare").innerHTML).toContain(options.expansions[0]!);
		expect(get("matrix").innerHTML).toContain(summaries[0]!.heroName);
		get("hero").value = options.heroes[0]!;
		listeners.get("hero:change")?.();
		expect(get("matrix").innerHTML).toContain(summaries[0]!.heroName);
		expect(get("matrix").innerHTML).not.toContain(summaries.find((s) =>
			s.heroId === options.heroes[1])!.heroName);
		expect(get("matrix").innerHTML).toContain("50.0%");
		get("profile").value = "casual";
		listeners.get("profile:change")?.();
		expect(get("matrix").innerHTML).toContain("100.0%");
		expect(get("metrics").innerHTML).toContain("50.0%");
	});

});

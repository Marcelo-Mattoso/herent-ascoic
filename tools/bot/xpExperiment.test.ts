import { describe, expect, it } from "vitest";
import { engine } from "../golden/lib";
import { balanceOf } from "@/core/gameEngine";
import { scoreAction } from "./brain";
import { createBotTrialEngine, createHeadlessPort } from "./port";
import { benchmarkBoss, defaultBenchmarkOptions } from "./dungeonBenchmark";
import { BOT_LEVELING_XP_EXPERIMENT } from "./xpExperiment";
import { setupForRun } from "./profiles";

describe("XP experimental exclusivo do bot de leveling", () => {
	it("mantém intactos os preços públicos ao criar engine experimental", () => {
		const officialBefore = { ...balanceOf(engine).xpCosts };
		const bot = createBotTrialEngine(BOT_LEVELING_XP_EXPERIMENT);
		expect(balanceOf(bot).xpCosts).toMatchObject({
			buy_item: 8, buy_artifact: 20, level_up: 10, recover_dungeon: 5,
		});
		expect(balanceOf(engine).xpCosts).toEqual(officialBefore);
		expect(officialBefore).toMatchObject({ buy_item: 15, buy_artifact: 35 });
		expect(defaultBenchmarkOptions().xpExperiment).toBeUndefined();
	});

	it("prioriza nível e recuperação; itens e artefatos ficam secundários", () => {
		const setup = { ...setupForRun(1, ["hero_crimson_barbarian"], "normal"),
			bossCardId: benchmarkBoss("fornalha-sombria") };
		const view = createHeadlessPort(setup).observe().view;
		const hero = view.heroes[0]!;
		const leveling = { ...view, status: "XP_SPEND_PHASE" as const, groupXp: 35,
			groupArtifacts: [] };
		const score = (v: typeof leveling, option: "buy_item" | "buy_artifact" | "recover_dungeon" | "level_up") =>
			scoreAction(v, { type: "SPEND_XP", payload: {
				option, ...(option === "level_up" ? { heroId: hero.id } : {}),
			} }, "power-player");
		expect(score(leveling, "level_up")).toBeGreaterThan(score(leveling, "buy_artifact"));
		expect(score(leveling, "level_up")).toBeGreaterThan(score(leveling, "buy_item"));
		expect(score(leveling, "recover_dungeon")).toBeGreaterThan(score(leveling, "buy_artifact"));
		expect(score(leveling, "buy_item")).toBeLessThan(score(leveling, "level_up"));
		const fullyLeveled = { ...leveling, heroes: [{ ...hero, impeto: 4 as const }] };
		expect(score(fullyLeveled, "buy_item")).toBeLessThan(0);
		expect(score(fullyLeveled, "buy_artifact")).toBeLessThan(0);
	});

	it("o relatório volta aos custos oficiais sem aplicar o override experimental", () => {
		expect(defaultBenchmarkOptions().xpExperiment).toBeUndefined();
	});
});

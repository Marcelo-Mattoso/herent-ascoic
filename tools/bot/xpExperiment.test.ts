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
		expect(defaultBenchmarkOptions().xpExperiment).toMatchObject(BOT_LEVELING_XP_EXPERIMENT);
	});

	it("abre a partida com override isolado e prioriza artefato antes do terceiro", () => {
		const setup = { ...setupForRun(1, ["hero_crimson_barbarian"], "normal"),
			bossCardId: benchmarkBoss("fornalha-sombria") };
		const view = createHeadlessPort(setup, BOT_LEVELING_XP_EXPERIMENT).observe().view;
		const hero = view.heroes[0]!;
		const updated = { ...view, status: "XP_SPEND_PHASE" as const, groupXp: 20,
			groupArtifacts: [] };
		const purchase = scoreAction(updated, { type: "SPEND_XP", payload: {
			option: "buy_artifact",
		} }, "speedrunner");
		const level = scoreAction(updated, { type: "SPEND_XP", payload: {
			option: "level_up", heroId: hero.id,
		} }, "speedrunner");
		expect(purchase).toBeGreaterThan(level);
	});
});

import { describe, expect, it } from "vitest";
import { soloDecisionFeatures, soloPolicyAdjustment, hasSoloWeightsForHero,
  soloWeightKey } from "./soloPolicy";
import { catalogFingerprint } from "./fingerprint";
import { candidateFeatures } from "./soloTrainer";
import type { PlayerView } from "@/core/projection/playerView";

const view = { status: "BOSS_COMBAT", heroes: [{ id: "h", cardId: "hero_tester", maxLife: 10, currentLife: 3 }],
  enemies: [{ status: "active", damage: 4 }], roomsCleared: 8, combat: { round: 2 },
  abilityActionsByHero: {}, pendingRewards: [] } as unknown as PlayerView;
describe("Instrutor solo", () => {
  it("descobre timing de item e perigo sem IDs hardcoded", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    const found = soloDecisionFeatures(view, action);
    expect(found).toContain("hero:hero_tester|decision:item");
    expect(found).toContain("hero:hero_tester|item@item:boss");
    expect(found).toContain("hero:hero_tester|item@health:critical");
    expect(found).toContain("hero:hero_tester|item@threat:lethal");
  });
  it("política não altera o comportamento em grupos", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    const policy = { version: 1 as const, catalogFingerprint: catalogFingerprint(),
      weights: { "hero:hero_tester|item@item:boss": 100 } };
    expect(soloPolicyAdjustment(view, action, policy)).toBe(100);
    expect(soloPolicyAdjustment({ ...view, heroes: [...view.heroes, { ...view.heroes[0]!, id: "h2" }] },
      action, policy)).toBe(0);
  });
  it("isola aprendizado por perfil sem contaminar speedrunner ou casual", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    const feature = "hero:hero_tester|item@item:boss";
    const policy = { version: 1 as const, catalogFingerprint: catalogFingerprint(),
      weights: { [soloWeightKey("power-player", feature)]: 90,
        [soloWeightKey("speedrunner", feature)]: -35 } };
    expect(soloPolicyAdjustment(view, action, policy, "power-player")).toBe(90);
    expect(soloPolicyAdjustment(view, action, policy, "speedrunner")).toBe(-35);
    expect(hasSoloWeightsForHero(policy, "power-player", "hero_tester")).toBe(true);
    expect(hasSoloWeightsForHero(policy, "speedrunner", "hero_tester")).toBe(true);
    expect(hasSoloWeightsForHero(policy, "speedrunner", "hero_outro")).toBe(false);
  });
  it("distribui aprendizado entre todos os heróis em vez de favorecer um só", () => {
    const counts: Record<string, number> = {};
    for (const hero of ["a", "b", "c", "d"]) {
      for (const decision of ["skill", "item", "power"]) {
        counts["hero:" + hero + "|decision:" + decision] = 20;
        counts["hero:" + hero + "|" + decision + "@effect:boost"] = 10;
      }
    }
    const chosen = candidateFeatures(counts, { focus: "all", maxFeatures: 9 });
    expect(chosen).toHaveLength(9);
    expect(new Set(chosen.map(key => key.split("|")[0]))).toEqual(
      new Set(["hero:a", "hero:b", "hero:c", "hero:d"]));
    expect(chosen.some(key => key.includes("decision:skill"))).toBe(true);
    expect(chosen.some(key => key.includes("decision:item"))).toBe(true);
    expect(chosen.some(key => key.includes("decision:power"))).toBe(true);
  });
  it("distribui treino especializado de itens por personagem", () => {
    const counts = Object.fromEntries(["a", "b", "c", "d"].map(hero =>
      ["hero:" + hero + "|decision:item", 20]));
    const chosen = candidateFeatures(counts, { focus: "items", maxFeatures: 4 });
    expect(new Set(chosen.map(key => key.split("|")[0]))).toEqual(
      new Set(["hero:a", "hero:b", "hero:c", "hero:d"]));
  });
  it("invalida conhecimento que não corresponde ao catálogo", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    expect(soloPolicyAdjustment(view, action, { version: 1,
      catalogFingerprint: "catálogo-antigo", weights: { "hero:hero_tester|item@item:boss": 150 } })).toBe(0);
  });
});

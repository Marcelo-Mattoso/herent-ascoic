import { describe, expect, it } from "vitest";
import { soloDecisionFeatures, soloPolicyAdjustment } from "./soloPolicy";
import { catalogFingerprint } from "./fingerprint";
import type { PlayerView } from "@/core/projection/playerView";

const view = { status: "BOSS_COMBAT", heroes: [{ id: "h", maxLife: 10, currentLife: 3 }],
  enemies: [{ status: "active", damage: 4 }], roomsCleared: 8, combat: { round: 2 },
  abilityActionsByHero: {}, pendingRewards: [] } as unknown as PlayerView;
describe("Instrutor solo", () => {
  it("descobre timing de item e perigo sem IDs hardcoded", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    const found = soloDecisionFeatures(view, action);
    expect(found).toContain("decision:item");
    expect(found).toContain("item@item:boss");
    expect(found).toContain("item@health:critical");
    expect(found).toContain("item@threat:lethal");
  });
  it("política não altera o comportamento em grupos", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    const policy = { version: 1 as const, catalogFingerprint: catalogFingerprint(),
      weights: { "item@item:boss": 100 } };
    expect(soloPolicyAdjustment(view, action, policy)).toBe(100);
    expect(soloPolicyAdjustment({ ...view, heroes: [...view.heroes, { ...view.heroes[0]!, id: "h2" }] },
      action, policy)).toBe(0);
  });
  it("invalida conhecimento que não corresponde ao catálogo", () => {
    const action = { type: "USE_ITEM" as const, payload: { itemId: "item-test", heroId: "h" } };
    expect(soloPolicyAdjustment(view, action, { version: 1,
      catalogFingerprint: "catálogo-antigo", weights: { "item@item:boss": 150 } })).toBe(0);
  });
});

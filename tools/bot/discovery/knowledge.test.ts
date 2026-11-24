import { describe, expect, it } from "vitest";
import { actionTraits, knowledgeBonus, type StrategyRule } from "./knowledge";
import { minePatterns, patternKey } from "./miner";
import type { PlayerView } from "@/core/projection/playerView";
const rule: StrategyRule = { pattern: ["i_mark_target", "action:attack"], bonus: 20, status: "validated",
  evidence: { pairedTrials: 40, baselineWins: 9, improvedWins: 14, seedStart: 200000 } };
describe("desbravador", () => {
  it("interpreta tipo de efeito da carta, sem nome específico na regra", () => {
    expect(actionTraits({ type: "USE_SKILL", payload: {
      skillId: "skill_prey_mark", sourceId: "h" } })).toContain("i_mark_target");
  });
  it("exige sequência e nunca aplica regras desconectadas", () => {
    const attack = { type: "CHOOSE_TARGET" as const, payload: { heroId: "h", enemyId: "e" } };
    const view = {} as unknown as PlayerView;
    expect(knowledgeBonus(attack, view, ["i_mark_target"], [rule])).toBe(20);
    expect(knowledgeBonus(attack, view, [], [rule])).toBe(0);
    expect(knowledgeBonus(attack, { heroes: [{ id: "h" }, { id: "a" }] } as unknown as PlayerView,
      ["i_mark_target"], [{ ...rule, context: { partySize: 1 } }])).toBe(0);
    const teamView = { heroes: [{ id: "h" }, { id: "a" }] } as unknown as PlayerView;
    const cooperative = { ...rule, context: { partySize: 2, cooperative: true } };
    expect(knowledgeBonus(attack, teamView, ["i_mark_target"], [cooperative], ["h"])).toBe(0);
    expect(knowledgeBonus(attack, teamView, ["i_mark_target"], [cooperative], ["a"])).toBe(20);
  });
  it("considera um padrão apenas uma vez por partida", () => {
    const pair = patternKey(["i_mark_target", "action:attack"]);
    const observations = [{ context: "x", won: true, pairs: [pair, pair] },
      { context: "y", won: false, pairs: [pair] }];
    expect(minePatterns(observations, 2)[0]?.support).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { BOT_PROFILES, parseBotProfile, usesLearnedStrategies } from "./profiles";
import { scoreMoves } from "./brain";
import type { BotObservation } from "./observe";

describe("separação de estilos de bot", () => {
  it("usa três perfis, com aprendizado publicado só no Power Player", () => {
    expect(BOT_PROFILES).toEqual(["casual", "power-player", "explorer"]);
    expect(BOT_PROFILES.filter(usesLearnedStrategies)).toEqual(["power-player"]);
    for (const deprecated of ["speedrunner", "random"]) {
      expect(() => parseBotProfile(deprecated)).toThrow(/Perfil desconhecido/);
    }
  });

  const observation = {
    view: { status: "HERO_ACTION", heroes: [], enemies: [], roomsCleared: 0,
      combat: null, pendingRewards: [], pendingSkillChoice: null },
    actions: [{ type: "CHECK_COMBAT_END" }, { type: "CHECK_BOSS_CONDITION" },
      { type: "DEFEAT" }],
    abilities: {},
  } as unknown as BotObservation;

  it("Casual é reproduzível e não escolhe derrota voluntária por sorteio", () => {
    for (let decision = 0; decision < 20; decision++) {
      const first = scoreMoves(observation, "casual", 3, decision);
      const again = scoreMoves(observation, "casual", 3, decision);
      expect(first).toEqual(again);
      expect(first[0]?.action.type).not.toBe("DEFEAT");
    }
  });

  it("Explorer prioriza a opção menos exercitada mantendo ações legais da projeção", () => {
    const options = {
      ...observation,
      actions: [{ type: "CHECK_COMBAT_END" },
        { type: "SKILL_CHOICE", payload: { skillId: "x", choice: "1" } }],
    } as unknown as BotObservation;
    const used = new Map([["CHECK_COMBAT_END", 100]]);
    const ranked = scoreMoves(options, "explorer", 1, 1,
      { stagnantRounds: 0, explorationUsage: used });
    expect(ranked[0]?.action.type).toBe("SKILL_CHOICE");
    expect(ranked).toHaveLength(2);
  });
});

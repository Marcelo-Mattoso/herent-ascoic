import { describe, expect, it } from "vitest";
import type { EnemyView, PlayerView } from "@/core/projection/playerView";
import { createHeadlessPort } from "./port";
import { setupForRun } from "./profiles";
import { scoreStrategicPower } from "./powerTactics";

function fixture(heroCardId: string, abilityId: string) {
  const observed = createHeadlessPort({
    ...setupForRun(1, [heroCardId], "normal"), bossCardId: "boss_azhakar",
  }).observe();
  const hero = observed.view.heroes[0]!;
  const ability = observed.abilities[hero.id]?.find(a => a.abilityId === abilityId);
  expect(ability, "Poder não projetado para " + heroCardId).toBeDefined();
  const enemy: EnemyView = {
    id: "enemy-1", cardId: "creature_deep_rift_rat", status: "active",
    firstDamageTakenThisTurn: false,
    currentLife: 12, maxLife: 12, damage: 3, dice: 1, hitBonus: 0,
    tokens: {}, conditions: [],
  };
  const make = (heroLife: number, isBoss: boolean) => {
    const self = { ...hero, currentLife: heroLife };
    const target = isBoss ? { ...enemy, id: "boss" } : enemy;
    const view: PlayerView = { ...observed.view, heroes: [self], enemies: [target],
      status: isBoss ? "BOSS_COMBAT" : "HERO_ACTION" };
    return { view, self };
  };
  return { ability: ability!, hero, make };
}

describe("P0.2: custo de oportunidade e reserva de poderes", () => {
  it("não desperdiça escudo temporário cedo, mas o prioriza em risco letal no chefe", () => {
    const { ability, hero, make } = fixture("hero_broken_bastion_warrior", "power_unbreakable_bastion_guard");
    const early = make(hero.maxLife, false);
    const emergency = make(2, true);
    expect(scoreStrategicPower(early.view, ability, early.self, 165)).toBeLessThan(165);
    expect(scoreStrategicPower(emergency.view, ability, emergency.self, 165)).toBeGreaterThan(200);
  });

  it("preserva bônus ofensivo para o chefe salvo emergência real", () => {
    const { ability, hero, make } = fixture("hero_crimson_rune_mage", "power_supreme_rift_rune");
    const early = make(hero.maxLife, false);
    const boss = make(hero.maxLife, true);
    expect(scoreStrategicPower(early.view, ability, early.self, 160)).toBeLessThan(100);
    expect(scoreStrategicPower(boss.view, ability, boss.self, 160)).toBeGreaterThan(200);
  });

  it("recupera deck só quando necessário e nunca desperdiça o poder no chefe", () => {
    const { ability, hero, make } = fixture("hero_rift_rogue", "power_restored_path");
    const early = make(hero.maxLife, false);
    const used = { ...early.view, decks: { ...early.view.decks,
      dungeonDeck: { ...early.view.decks.dungeonDeck,
        available: 1, discarded: ["room_dungeon_room"] } } } as PlayerView;
    const safe = { ...used, decks: { ...used.decks,
      dungeonDeck: { ...used.decks.dungeonDeck, available: 15 } } } as PlayerView;
    expect(scoreStrategicPower(used, ability, early.self, 160)).toBeGreaterThan(200);
    expect(scoreStrategicPower(safe, ability, early.self, 160)).toBeLessThan(100);
    const boss = make(hero.maxLife, true);
    expect(scoreStrategicPower({ ...boss.view, decks: used.decks }, ability, boss.self, 160)).toBe(-1);
  });

  it("conserva cura completa fora do chefe quando não há ferimentos", () => {
    const { ability, hero, make } = fixture("hero_white_ashes_sister", "witch_power_white_ash_mercy");
    const safe = make(hero.maxLife, false);
    expect(scoreStrategicPower(safe.view, ability, safe.self, 160)).toBe(-1);
    const critical = make(2, true);
    expect(scoreStrategicPower(critical.view, ability, critical.self, 160)).toBeGreaterThan(200);
  });
});

/** Seeds reais do audit 2026-11-24T17:37:20Z. Watchlist, não bugs presumidamente resolvidos. */
import { describe, expect, it } from "vitest";
import { playAiGame } from "./ai";
import { benchmarkBoss } from "./dungeonBenchmark";
import { setupForRun, type BotProfile } from "./profiles";
import type { Difficulty } from "@/core/state/gameState";

interface StallCase {
  readonly id: string;
  readonly seed: number;
  readonly hero: string;
  readonly expansion: string;
  readonly difficulty: Difficulty;
  readonly profile: BotProfile;
  readonly original: string;
}
const known: readonly StallCase[] = [
  { id: "power-rogue-castle", seed: 1, hero: "hero_rift_rogue",
    expansion: "castelo-horizonte-infindo", difficulty: "hard",
    profile: "power-player", original: "max_steps_exceeded" },
  { id: "casual-sister-forge", seed: 5, hero: "hero_white_ashes_sister",
    expansion: "fornalha-sombria", difficulty: "normal",
    profile: "casual", original: "boss_stalemate" },
  { id: "explorer-cleric-witch", seed: 5, hero: "hero_eternal_rest_cleric",
    expansion: "torre-grande-bruxa-caldeirao", difficulty: "normal",
    profile: "explorer", original: "combat_no_damage_stalemate" },
  { id: "casual-wanderer-castle", seed: 6, hero: "hero_plains_wanderer",
    expansion: "castelo-horizonte-infindo", difficulty: "hard",
    profile: "casual", original: "max_steps_exceeded" },
  { id: "power-cleric-forge", seed: 7, hero: "hero_eternal_rest_cleric",
    expansion: "fornalha-sombria", difficulty: "normal",
    profile: "power-player", original: "boss_stalemate" },
  { id: "power-sister-forge", seed: 7, hero: "hero_white_ashes_sister",
    expansion: "fornalha-sombria", difficulty: "normal",
    profile: "power-player", original: "boss_stalemate" },
  { id: "casual-oak-forge", seed: 9, hero: "hero_oak_guardian",
    expansion: "fornalha-sombria", difficulty: "normal",
    profile: "casual", original: "boss_stalemate" },
];

describe("P0.2: sete impasses conhecidos em audit anterior", () => {
  it.each(known)("$id: não introduz falha estrutural e mantém diagnóstico explícito", c => {
    const setup = { ...setupForRun(c.seed, [c.hero], c.difficulty),
      bossCardId: benchmarkBoss(c.expansion) };
    const result = playAiGame(setup, 1000, undefined, c.profile);
    expect(result.steps).toBeLessThanOrEqual(1000);
    // Melhorias são aceitas (VICTORY/DEFEAT sem violation).
    // Um impasse ainda é uma investigação aberta, jamais resultado aprovado.
    expect([null, "boss_stalemate", "max_steps_exceeded",
      "combat_no_damage_stalemate"]).toContain(result.violation?.invariant ?? null);
  }, 90_000);
});

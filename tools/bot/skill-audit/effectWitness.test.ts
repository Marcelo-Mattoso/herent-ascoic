import { describe, expect, it } from "vitest";
import { heroesOf, withUnitStats } from "@/core/state/access";
import { witnessEffectKinds } from "./effectWitness";
import { combat } from "./runtime";

describe("evidências observáveis por efeito DSL", () => {
  it("não considera a mera declaração de cura como prova de cura", () => {
    const state = combat("hero_eternal_rest_cleric");
    expect(witnessEffectKinds(state, state, ["i_heal"])).toEqual([]);
  });
  it("mede dano sem depender do ID da habilidade", () => {
    const before = combat("hero_eternal_rest_cleric");
    const hero = heroesOf(before)[0]!;
    const after = withUnitStats(before, hero.id, { currentLife: hero.currentLife - 1 });
    expect(witnessEffectKinds(before, after, ["i_damage", "i_heal"])).toEqual(["i_damage"]);
  });
});

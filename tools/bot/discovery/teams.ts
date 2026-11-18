/**
 * Seleção determinística de equipes por diversidade dos efeitos DSL.
 * Nunca enumera composições no benchmark oficial, apenas no experimento opt-in.
 */
import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { effectKinds } from "@/core/abilities/trace";
import { NON_EFFECT_KINDS } from "./sequence";

export function teamCandidates(
  heroIds: readonly string[],
  size: 2 | 3 | 4,
  limit: number,
): string[][] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Limite de equipes inválido");
  const ids = [...new Set(heroIds)].sort();
  const traits = new Map(ids.map(id => [id, new Set(cardAbilityGrants(id).flatMap(grant =>
    effectKinds(lookupAbilityById(grant.abilityId)?.effect).filter(kind =>
      !NON_EFFECT_KINDS.has(kind))))]));
  const all: string[][] = [];
  const enumerate = (start: number, selected: string[]): void => {
    if (selected.length === size) { all.push(selected); return; }
    for (let i = start; i <= ids.length - (size - selected.length); i++)
      enumerate(i + 1, [...selected, ids[i]!]);
  };
  enumerate(0, []);
  const result: string[][] = [];
  const represented = new Set<string>();
  while (result.length < limit && all.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < all.length; i++) {
      const party = all[i]!;
      const diversity = new Set(party.flatMap(id => [...(traits.get(id) ?? [])])).size;
      const newHeroes = party.filter(id => !represented.has(id)).length;
      const score = newHeroes * 100 + diversity;
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }
    const [next] = all.splice(bestIndex, 1);
    result.push(next!);
    for (const hero of next!) represented.add(hero);
  }
  return result;
}

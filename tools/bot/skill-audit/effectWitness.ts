/**
 * Evidências independentes do catálogo de habilidades: compara estado antes/depois.
 * Correlacionar a mudança ao grant NÃO equivale a isolar causalidade quando
 * vários efeitos executam na mesma janela. Nunca promove cobertura integral.
 */
import { gameOf } from "@/engine/state";
import { enemiesOf, heroesOf, worldOf, decksOf } from "@/core/state/access";
import type { GameState } from "@/core/state/gameState";
import type { Component } from "@/core/ecs/types";

type Unit = { id: string; currentLife: number; conditions: readonly string[] };
function units(state: GameState): ReadonlyMap<string, Unit> {
  return new Map([...heroesOf(state), ...enemiesOf(state)].map(unit => [unit.id, unit]));
}
function addedComponent(before: GameState, after: GameState, type: Component["type"]): boolean {
  const previous = worldOf(before).entities;
  for (const [id, entity] of Object.entries(worldOf(after).entities)) {
    const counts = new Map<string, number>();
    for (const component of previous[id]?.components ?? []) if (component.type === type) {
      const key = JSON.stringify(component);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const component of entity.components) if (component.type === type) {
      const key = JSON.stringify(component);
      const remaining = counts.get(key) ?? 0;
      if (!remaining) return true;
      counts.set(key, remaining - 1);
    }
  }
  return false;
}
function conditionChanged(before: GameState, after: GameState, prefix?: string): boolean {
  const original = units(before);
  for (const [id, unit] of units(after)) {
    const old = original.get(id);
    if (!old) continue;
    const select = (conditions: readonly string[]) =>
      conditions.filter(value => !prefix || value.startsWith(prefix)).sort().join("|");
    if (select(old.conditions) !== select(unit.conditions)) return true;
  }
  return false;
}
export function witnessEffectKinds(
  before: GameState,
  after: GameState,
  declared: readonly string[],
): string[] {
  const initial = units(before);
  const final = units(after);
  const wounded = [...final].some(([id, unit]) => unit.currentLife < (initial.get(id)?.currentLife ?? unit.currentLife));
  const healed = [...final].some(([id, unit]) => unit.currentLife > (initial.get(id)?.currentLife ?? unit.currentLife));
  const modifierAdded = addedComponent(before, after, "modifier");
  const triggerAdded = addedComponent(before, after, "trigger");
  const dungeonBefore = decksOf(before).dungeonDeck;
  const dungeonAfter = decksOf(after).dungeonDeck;
  const dungeonChanged = dungeonBefore.available.length !== dungeonAfter.available.length ||
    dungeonBefore.discarded.length !== dungeonAfter.discarded.length;
  const itemBefore = decksOf(before).itemDeck;
  const itemAfter = decksOf(after).itemDeck;
  const resourceChanged = itemBefore.available.length !== itemAfter.available.length ||
    itemBefore.discarded.length !== itemAfter.discarded.length ||
    decksOf(before).artifactDeck.available.length !== decksOf(after).artifactDeck.available.length;
  const combatBefore = gameOf(before).combat;
  const combatAfter = gameOf(after).combat;
  const diceChanged = JSON.stringify(combatBefore?.lastRoll?.heroResults) !==
    JSON.stringify(combatAfter?.lastRoll?.heroResults) ||
    JSON.stringify(combatBefore?.lastRoll?.enemyResults) !==
    JSON.stringify(combatAfter?.lastRoll?.enemyResults);
  const marked = JSON.stringify(combatBefore?.preyByHero) !== JSON.stringify(combatAfter?.preyByHero);
  const blocksChanged = JSON.stringify(gameOf(before).blocks) !== JSON.stringify(gameOf(after).blocks);
  const flagsChanged = JSON.stringify(gameOf(before).flags) !== JSON.stringify(gameOf(after).flags);
  const rewardsChanged = JSON.stringify(gameOf(before).pendingRewards) !== JSON.stringify(gameOf(after).pendingRewards);
  const changed: Readonly<Record<string, boolean>> = {
    i_damage: wounded,
    i_heal: healed,
    i_full_heal: healed,
    p_modifier: modifierAdded,
    add_trigger: triggerAdded,
    p_block: blocksChanged,
    i_apply_poison: conditionChanged(before, after, "poison:") ||
      conditionChanged(before, after, "dot:v1:"),
    i_apply_damage_over_time: conditionChanged(before, after, "dot:v1:"),
    i_poison_ward: conditionChanged(before, after, "poison_ward:"),
    i_remove_status: conditionChanged(before, after),
    i_dispel: conditionChanged(before, after),
    i_mark_target: marked,
    i_discard: dungeonChanged || resourceChanged,
    i_recover_dungeon: dungeonChanged,
    i_draw: dungeonChanged || resourceChanged,
    i_draw_and_choose: dungeonChanged || resourceChanged || rewardsChanged,
    i_grant_reward: rewardsChanged,
    i_prevent_destroy: flagsChanged,
    i_prevent_dungeon_discard: blocksChanged || flagsChanged,
    i_modify_die: diceChanged,
    i_reroll: diceChanged,
    i_set_die: diceChanged,
  };
  return [...new Set(declared.filter(kind => changed[kind] === true))];
}

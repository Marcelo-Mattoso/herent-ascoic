/** Política de decisões SOLO: pesos aprendidos sobre características declarativas. */
import published from "@/data/soloPolicy.json";
import type { Action } from "@/core/actions/types";
import type { PlayerView } from "@/core/projection/playerView";
import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { getCardById } from "@/core/data/cards";
import { effectKinds } from "@/core/abilities/trace";
import { catalogFingerprint } from "./fingerprint";

export interface SoloPolicy {
  readonly version: 1;
  readonly catalogFingerprint?: string;
  readonly weights: Readonly<Record<string, number>>;
}
const fingerprint = catalogFingerprint();
export const historicalSoloPolicy: SoloPolicy = published as SoloPolicy;
export const publishedSoloPolicy: SoloPolicy = historicalSoloPolicy.catalogFingerprint === fingerprint
  ? historicalSoloPolicy : { version: 1, catalogFingerprint: fingerprint, weights: {} };
const wrappers = new Set(["i_if", "i_for_each", "i_choose_one", "add_trigger", "i_noop"]);
function effects(cardId?: string, abilityId?: string): string[] {
  const ids = abilityId ? [abilityId] : (cardId ? cardAbilityGrants(cardId).map(g => g.abilityId) : []);
  return [...new Set(ids.flatMap(id =>
    effectKinds(lookupAbilityById(id)?.effect).filter(kind => !wrappers.has(kind))))];
}
export function soloDecisionFeatures(view: PlayerView, action: Action): readonly string[] {
  let group: "item" | "power" | "skill" | "loot" | "reaction" | "artifact" | null = null;
  let cardId: string | undefined;
  let abilityId: string | undefined;
  let heroId: string | undefined;
  if (action.type === "USE_ITEM" || action.type === "USE_REWARD_ITEM") {
    group = "item"; cardId = action.payload.itemId; heroId = action.payload.heroId;
  } else if (action.type === "USE_ARTIFACT") {
    group = "artifact"; cardId = action.payload.artifactId; abilityId = action.payload.abilityId;
  } else if (action.type === "USE_POWER") {
    group = "power"; heroId = action.payload.heroId;
    const power = view.abilityActionsByHero[heroId]?.find(a => a.kind === "power" && a.status === "available");
    cardId = power?.sourceCardId; abilityId = power?.abilityId;
  } else if (action.type === "USE_SKILL") {
    heroId = action.payload.sourceId; abilityId = action.payload.skillId;
    const projected = view.abilityActionsByHero[heroId]?.find(a => a.abilityId === abilityId);
    group = projected?.kind === "power" ? "power" : projected?.kind === "item" ? "item" : "skill";
    cardId = projected?.sourceCardId;
  } else if (action.type === "APPLY_TRIGGER_INTERRUPT" || action.type === "SKIP_TRIGGER_INTERRUPT") {
    group = "reaction"; heroId = view.pendingTriggerInterrupt?.sourceHeroId;
    abilityId = view.pendingTriggerInterrupt?.skillId;
    cardId = view.pendingTriggerInterrupt?.sourceCardId;
  } else if (action.type === "CHOOSE_ITEM_DESTINATION") {
    group = "loot"; heroId = action.payload.heroId; cardId = view.pendingRewards[0]?.cardId;
  } else if (action.type === "CHOOSE_ARTIFACT_BEARER") {
    group = "loot"; heroId = action.payload.heroId ?? undefined; cardId = view.pendingRewards[0]?.cardId;
  }
  if (!group) return [];
  const out = new Set<string>(["decision:" + group]);
  if (cardId) out.add("card:" + cardId);
  if (abilityId) out.add("ability:" + abilityId);
  const card = cardId ? getCardById(cardId) : null;
  const kinds = effects(cardId, abilityId);
  if (kinds.some(k => ["i_heal", "i_full_heal", "i_recover_dungeon"].includes(k))) out.add("effect:recovery");
  if (kinds.some(k => ["i_damage", "i_apply_poison", "i_apply_damage_over_time"].includes(k))) out.add("effect:offense");
  if (kinds.some(k => ["p_block", "i_prevent_destroy", "i_prevent_next_damage", "i_poison_ward"].includes(k)))
    out.add("effect:defense");
  if (kinds.some(k => ["p_modifier", "i_modify_die", "i_set_die", "i_reroll", "i_mark_target"].includes(k)))
    out.add("effect:boost");
  if (card?.type === "item") out.add("itemclass:" + card.itemClass);
  if (action.type === "CHOOSE_ITEM_DESTINATION") {
    out.add("loot:" + action.payload.destination);
    if (card?.type === "item") out.add("lootclass:" + card.itemClass);
  }
  if (group === "reaction") out.add(action.type === "APPLY_TRIGGER_INTERRUPT" ? "reaction:apply" : "reaction:save");
  const boss = view.status === "BOSS_COMBAT";
  out.add("phase:" + (boss ? "boss" : view.combat ? "combat" : "explore"));
  if (group === "power") out.add("power:" + (boss ? "boss" : view.roomsCleared <= 2 ? "early" : "normal"));
  if (group === "item") out.add("item:" + (boss ? "boss" : "regular"));
  const hero = view.heroes.find(h => h.id === heroId) ?? view.heroes[0];
  if (hero) {
    const ratio = hero.maxLife > 0 ? hero.currentLife / hero.maxLife : 1;
    out.add("health:" + (ratio <= .35 ? "critical" : ratio <= .7 ? "wounded" : "healthy"));
    const maxEnemyDamage = Math.max(0, ...view.enemies.filter(e => e.status === "active").map(e => e.damage));
    if (maxEnemyDamage && hero.currentLife <= maxEnemyDamage) out.add("threat:lethal");
    if (ratio > .95 && kinds.some(k => ["i_heal", "i_full_heal"].includes(k))) out.add("recovery:waste");
  }
  if ((view.combat?.round ?? 0) >= 4) out.add("timing:late-round");
  if (view.roomsCleared >= 6) out.add("timing:deep-dungeon");
  return [...out];
}
export function soloPolicyAdjustment(view: PlayerView, action: Action,
  policy: SoloPolicy | null | undefined = publishedSoloPolicy): number {
  if (!policy || view.heroes.length !== 1 || policy.catalogFingerprint !== fingerprint) return 0;
  const score = soloDecisionFeatures(view, action).reduce((sum, key) => sum +
    (Number.isFinite(policy.weights[key]) ? policy.weights[key]! : 0), 0);
  return Math.max(-250, Math.min(250, score));
}

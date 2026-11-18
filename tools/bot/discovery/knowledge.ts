/** Biblioteca compartilhada: o bot só consome regras com status validated. */
import published from "@/data/discoveryKnowledge.json";
import type { Action } from "@/core/actions/types";
import type { PlayerView } from "@/core/projection/playerView";
import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { effectKinds } from "@/core/abilities/trace";

export interface StrategyRule {
  readonly pattern: readonly string[];
  readonly bonus: number;
  readonly status: "validated";
  readonly evidence: {
    readonly pairedTrials: number;
    readonly baselineWins: number;
    readonly improvedWins: number;
    readonly seedStart: number;
  };
}
export interface StrategyKnowledge { readonly version: 1; readonly rules: readonly StrategyRule[] }
export const publishedKnowledge: StrategyKnowledge = published as StrategyKnowledge;
const wrappers = new Set(["i_if", "i_choose_one", "i_for_each", "add_trigger", "i_noop"]);

/** Tipos de efeito, nunca IDs de heróis ou de habilidades. */
export function actionTraits(action: Action, view?: PlayerView): string[] {
  if (action.type === "CHOOSE_TARGET") return ["action:attack"];
  if (action.type === "SPEND_XP") return ["xp:" + action.payload.option];
  let id: string | undefined;
  if (action.type === "USE_SKILL") id = action.payload.skillId;
  if (action.type === "SKILL_CHOICE") id = action.payload.skillId;
  if (action.type === "APPLY_TRIGGER_INTERRUPT") id = view?.pendingTriggerInterrupt?.skillId;
  if (action.type === "USE_POWER") id = view?.abilityActionsByHero[action.payload.heroId]
    ?.find(a => a.kind === "power" && a.status === "available")?.abilityId;
  if (action.type === "USE_ARTIFACT") id = action.payload.abilityId ??
    cardAbilityGrants(action.payload.artifactId)[0]?.abilityId;
  if (action.type === "USE_ITEM" || action.type === "USE_REWARD_ITEM")
    id = cardAbilityGrants(action.payload.itemId)[0]?.abilityId;
  if (!id) return [];
  return [...new Set(effectKinds(lookupAbilityById(id)?.effect).filter(k => !wrappers.has(k)))];
}

export function knowledgeBonus(
  action: Action, view: PlayerView, history: readonly string[],
  rules: readonly StrategyRule[] = publishedKnowledge.rules,
): number {
  const traits = actionTraits(action, view);
  if (traits.length === 0) return 0;
  let best = 0;
  for (const rule of rules) {
    if (rule.status !== "validated" || !Number.isFinite(rule.bonus) || rule.bonus <= 0 ||
        rule.pattern.length < 1 || rule.pattern.length > 3) continue;
    if (!traits.includes(rule.pattern[rule.pattern.length - 1]!)) continue;
    const prefix = rule.pattern.slice(0, -1);
    if (prefix.length > history.length ||
      prefix.some((trait, index) => history[history.length - prefix.length + index] !== trait)) continue;
    best = Math.max(best, Math.min(45, rule.bonus));
  }
  return best;
}

/**
 * Sinais de descoberta extraídos de execuções reais, não de mera preparação.
 * Um tipo declarado pela DSL continua sendo HIPÓTESE de efeito: a validação
 * causal acontece nas partidas A/B, nunca nesta coleta.
 */
import type { AiStep } from "../ai";
import { gameOf } from "@/engine/state";
import { patternKey } from "./miner";

export interface DiscoverySignal {
  readonly trait: string;
  readonly heroId?: string;
}
export const NON_EFFECT_KINDS = new Set(["i_if", "i_choose_one", "i_for_each", "add_trigger", "i_noop"]);

export function stepSignals(step: AiStep): DiscoverySignal[] {
  const previous = gameOf(step.beforeState).abilityTrace?.at(-1)?.sequence ?? 0;
  const trace = (gameOf(step.afterState).abilityTrace ?? []).filter(entry =>
    entry.sequence > previous && (entry.outcome === "executed" || entry.outcome === "inline"));
  const activeHeroIds = new Set(step.before.heroes.map(h => h.id));
  const signals: DiscoverySignal[] = [];
  for (const entry of trace) {
    const atomic = entry.declaredKinds.find(kind => !NON_EFFECT_KINDS.has(kind));
    if (!atomic) continue; // Não inventar capacidade para scripts opacos.
    signals.push({
      trait: atomic,
      ...(entry.sourceEntityId && activeHeroIds.has(entry.sourceEntityId)
        ? { heroId: entry.sourceEntityId } : {}),
    });
  }
  if (step.chosen.action.type === "CHOOSE_TARGET") {
    signals.push({ trait: "action:attack", heroId: step.chosen.action.payload.heroId });
  }
  return signals;
}

export class SequenceCollector {
  private round = "";
  private recent: DiscoverySignal[] = [];
  private observed = new Set<string>();
  private cooperative = new Set<string>();

  record(step: AiStep): void {
    const key = [step.before.roomsCleared, step.before.combat?.round ?? 0,
      step.before.status === "BOSS_COMBAT" ? "boss" : "room"].join(":");
    if (key !== this.round) { this.recent = []; this.round = key; }

    for (const signal of stepSignals(step)) {
      for (const length of [2, 3]) {
        const previous = this.recent.slice(-(length - 1));
        if (previous.length !== length - 1) continue;
        const chain = [...previous, signal];
        const traits = chain.map(entry => entry.trait);
        if (new Set(traits).size < 2) continue;
        const signature = patternKey(traits);
        this.observed.add(signature);
        if (new Set(chain.map(entry => entry.heroId).filter(Boolean)).size >= 2)
          this.cooperative.add(signature);
      }
      this.recent = [...this.recent, signal].slice(-2);
    }
  }

  get patterns(): readonly string[] { return [...this.observed].sort(); }
  get cooperativePatterns(): readonly string[] { return [...this.cooperative].sort(); }
}

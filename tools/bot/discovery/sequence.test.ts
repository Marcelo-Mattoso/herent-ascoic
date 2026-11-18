import { describe, expect, it } from "vitest";
import { SequenceCollector, stepSignals } from "./sequence";
import type { AiStep } from "../ai";
import type { AbilityExecutionEvidence } from "@/core/abilities/trace";

function step(round: number, trait: string | null, actor: string, prepared = false): AiStep {
  const e: AbilityExecutionEvidence[] = trait ? [{
    sequence: 1, abilityId: "abstract", grantId: "g", sourceCardId: "card",
    sourceEntityId: actor, trigger: "manual", targets: [],
    declaredKinds: [trait], outcome: prepared ? "pending_choice" : "executed", hpDelta: {},
  }] : [];
  return {
    before: { roomsCleared: 1, status: "HERO_ACTION", combat: { round },
      heroes: [{ id: "h1" }, { id: "h2" }] },
    beforeState: { game: { abilityTrace: [], abilityTraceEnabled: true } },
    afterState: { game: { abilityTrace: e, abilityTraceEnabled: true } },
    chosen: { action: { type: "PASS_HERO_ACTION", payload: { heroId: actor } }, score: 0 },
  } as unknown as AiStep;
}

describe("sequências de descoberta", () => {
  it("não aprende habilidade apenas preparada", () => {
    expect(stepSignals(step(1, "i_heal", "h1", true))).toEqual([]);
  });
  it("descobre combo entre dois heróis a partir de eventos executados", () => {
    const collector = new SequenceCollector();
    collector.record(step(1, "i_mark_target", "h1"));
    collector.record(step(1, "p_modifier", "h2"));
    expect(collector.patterns).toContain("i_mark_target -> p_modifier");
    expect(collector.cooperativePatterns).toContain("i_mark_target -> p_modifier");
  });
  it("não cria combinação entre rodadas", () => {
    const collector = new SequenceCollector();
    collector.record(step(1, "i_mark_target", "h1"));
    collector.record(step(2, "p_modifier", "h2"));
    expect(collector.patterns).toEqual([]);
  });
});

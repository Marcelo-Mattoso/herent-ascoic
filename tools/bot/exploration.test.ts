import { describe, expect, it } from "vitest";
import { actionIdentity, adversarialOrder, adversarialScoredMoves } from "./exploration";
import type { Action } from "@/core/actions/types";

describe("Explorer / investigação adversarial", () => {
  const flow: Action = { type: "CHECK_COMBAT_END" };
  const rare: Action = { type: "SKILL_CHOICE", payload: { skillId: "x", choice: "1" } };
  const moves = [{ action: flow, score: 300 }, { action: rare, score: 15 }];

  it("prioriza uma ação rara sobre um fluxo repetido", () => {
    const usage = new Map([[actionIdentity(flow), 30]]);
    expect(adversarialOrder(moves, usage, () => 0.5)[0]).toEqual(rare);
  });

  it("é determinístico e não altera ações ou suas pontuações originais", () => {
    const weights = new Map([[actionIdentity(flow), 30]]);
    const first = adversarialScoredMoves(moves, weights, () => 0.5);
    const second = adversarialScoredMoves(moves, weights, () => 0.5);
    expect(first).toEqual(second);
    expect(first.map(x => x.action)).toEqual([rare, flow]);
    expect(first.find(x => x.action === flow)?.score).toBe(300);
    expect(moves[0]?.score).toBe(300);
  });
});

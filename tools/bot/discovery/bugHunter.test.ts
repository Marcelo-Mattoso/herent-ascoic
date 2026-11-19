import { describe, it, expect } from "vitest";
import { adversarialOrder } from "./bugHunter";
import type { Action } from "@/core/actions/types";

describe("caçador de bugs", () => {
  it("explora ações pouco usadas, de maneira determinística", () => {
    const first: Action = { type: "CHECK_COMBAT_END" };
    const second: Action = { type: "SKILL_CHOICE", payload: { skillId: "x", choice: "1" } };
    const options = [{ action: first, score: 300 }, { action: second, score: 15 }];
    const result = adversarialOrder(options, new Map([["CHECK_COMBAT_END", 30]]), () => 0.5);
    expect(result[0]).toEqual(second);
    expect(result).toHaveLength(2);
  });
});

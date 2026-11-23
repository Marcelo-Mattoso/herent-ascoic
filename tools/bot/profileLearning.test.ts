import { describe, expect, it } from "vitest";
import { BOT_PROFILES, usesLearnedStrategies } from "./profiles";

describe("separação de estilos de bot", () => {
  it("só Power Player e Speedrunner consomem estratégias publicadas", () => {
    expect(BOT_PROFILES).toEqual([
      "casual", "power-player", "speedrunner", "explorer", "random",
    ]);
    expect(BOT_PROFILES.filter(usesLearnedStrategies)).toEqual([
      "power-player", "speedrunner",
    ]);
  });
});

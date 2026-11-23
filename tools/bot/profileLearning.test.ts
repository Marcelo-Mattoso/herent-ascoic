import { describe, expect, it } from "vitest";
import { BOT_PROFILES, usesLearnedStrategies } from "./profiles";

describe("separação de estilos de bot", () => {
  it("somente Power Player usa estratégias promovidas", () => {
    expect(BOT_PROFILES).toEqual(["casual", "power-player", "explorer"]);
    expect(BOT_PROFILES.filter(usesLearnedStrategies)).toEqual(["power-player"]);
  });
});

import { describe, expect, it } from "vitest";
import { preparedTransitions, type PreparedProbe } from "./preparedTelemetry";

const fury: PreparedProbe = {
	"hero:barbarian:fury": { sourceKind: "hero", abilityId: "skill_crimson_fury" },
};

describe("ciclo de vida das habilidades preparadas", () => {
	it("distingue armar, limpar em ataque e limpar em outra fase", () => {
		expect(preparedTransitions({}, fury, "USE_SKILL").armedHeroAbilities)
			.toEqual(["skill_crimson_fury"]);
		expect(preparedTransitions(fury, {}, "ROLL_DICE").clearedDuringAttack)
			.toEqual(["skill_crimson_fury"]);
		expect(preparedTransitions(fury, {}, "REVEAL_ROOM").clearedElsewhere)
			.toEqual(["skill_crimson_fury"]);
	});

	it("não confunde preparações de item com habilidades de herói", () => {
		const item = { key: { sourceKind: "item" as const, abilityId: "item_ability" } };
		expect(preparedTransitions({}, item, "USE_ITEM").armedHeroAbilities).toEqual([]);
		expect(preparedTransitions(item, {}, "ROLL_DICE").clearedDuringAttack).toEqual([]);
	});
});

import { describe, expect, it } from "vitest";
import type { BotObservation } from "./observe";
import { forecastAttack, planCombos } from "./combo";

function observation(enemyCount: number): BotObservation {
	const barbarian = { id: "barbarian", cardId: "hero_crimson_barbarian", status: "active",
		currentLife: 12, maxLife: 12, hitBonus: 5, damage: 4, dice: 1 };
	const mage = { id: "mage", cardId: "hero_crimson_rune_mage", status: "active",
		currentLife: 8, maxLife: 8, hitBonus: 4, damage: 2, dice: 1 };
	const enemies = Array.from({ length: enemyCount }, (_, index) => ({
		id: `enemy-${index}`, cardId: "creature_old_chains_knight", status: "active",
		currentLife: 7, maxLife: 7, hitBonus: 5, damage: 5, dice: 1,
	}));
	return {
		view: { status: "HERO_ACTION", heroes: [barbarian, mage], enemies,
			combat: { round: 1, heroesActed: [] } } as unknown as BotObservation["view"],
		actions: [{ type: "CHOOSE_TARGET", payload: { heroId: barbarian.id, enemyId: enemies[0]!.id } }],
		abilities: {
			barbarian: [{ abilityId: "skill_crimson_fury", status: "available" }],
			mage: [{ abilityId: "skill_rift_rune", status: "available", validTargetIds: ["barbarian"] }],
		} as unknown as BotObservation["abilities"],
	};
}

describe("planejamento de combos do bot", () => {
	it("calcula chance e dano esperado com os dois dados, incluindo empate", () => {
		const result = forecastAttack({ dice: 1, hitBonus: 0, damage: 4 },
			{ dice: 1, hitBonus: 0, currentLife: 4 });
		expect(result.hitChance).toBeCloseTo(21 / 36);
		expect(result.killChance).toBeCloseTo(15 / 36);
		expect(result.expectedDamage).toBeCloseTo(66 / 36);
	});

	it("prepara a Runa em luta curta e preserva a ação do Mago quando está em desvantagem numérica", () => {
		const duel = planCombos(observation(1))[0]!;
		expect(duel.steps[0]).toMatchObject({ type: "USE_SKILL",
			payload: { skillId: "skill_rift_rune", targetIds: ["barbarian"] } });
		const surrounded = planCombos(observation(4))[0]!;
		expect(surrounded.steps[0]).not.toMatchObject({ type: "USE_SKILL",
			payload: { skillId: "skill_rift_rune" } });
	});
});

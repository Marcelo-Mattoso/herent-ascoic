import { describe, expect, it } from "vitest";
import { dungeonAwakeningEffect, piercedItemReduction } from "./dungeonAwakening";

describe("efeitos do Despertar", () => {
	it("usa o perfil completo de cada cor, sem acumular níveis anteriores", () => {
		expect(dungeonAwakeningEffect(0)).toEqual({ hitBonus: 0, damageBonus: 0, armorPenetration: 0, purpleSkillsEnabled: false });
		expect(dungeonAwakeningEffect(1)).toEqual({ hitBonus: 1, damageBonus: 0, armorPenetration: 0, purpleSkillsEnabled: false });
		expect(dungeonAwakeningEffect(2)).toEqual({ hitBonus: 1, damageBonus: 1, armorPenetration: 0, purpleSkillsEnabled: false });
		expect(dungeonAwakeningEffect(3)).toEqual({ hitBonus: 1, damageBonus: 1, armorPenetration: 1, purpleSkillsEnabled: false });
		expect(dungeonAwakeningEffect(4)).toEqual({ hitBonus: 1, damageBonus: 1, armorPenetration: 1, purpleSkillsEnabled: true });
	});
	it("penetração somente reduz proteção de itens, sem criar dano negativo", () => {
		expect(piercedItemReduction(0, 1)).toBe(0);
		expect(piercedItemReduction(1, 1)).toBe(0);
		expect(piercedItemReduction(3, 1)).toBe(2);
		expect(piercedItemReduction(2, 0)).toBe(2);
	});
});

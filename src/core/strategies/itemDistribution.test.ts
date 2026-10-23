import { describe, expect, it } from "vitest";
import { getItems } from "../data/cards";
import type { HeroState } from "../state/heroState";
import { getItemEquipmentSlot } from "./itemDistribution";

const hero = { cardId: "hero_crimson_barbarian", activeItems: {} } as HeroState;

describe("slots de itens", () => {
	it("usa o slot explícito da carta, nunca a classe", () => {
		for (const item of getItems()) {
			const slot = getItemEquipmentSlot(item, hero);
			expect(slot === null).toBe(!item.equipmentSlot);
		}
	});
});

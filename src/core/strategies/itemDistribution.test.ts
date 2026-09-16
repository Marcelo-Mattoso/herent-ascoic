import { describe, expect, it } from "vitest";
import { getItems } from "../data/cards";
import type { ItemClass } from "../data/cardTypes";
import type { ItemSlotType } from "../state/heroState";
import { getItemEquipmentSlot } from "./itemDistribution";

const EXPECTED_SLOTS: Readonly<Record<ItemClass, ItemSlotType>> = {
	equipment: "weapon",
	utility: "utility",
	consumable: "consumable",
	special: "special",
	charm: "special",
};

describe("slots de itens", () => {
	it("mapeia toda classe do catálogo para um dos quatro slots definidos no manual", () => {
		for (const item of getItems()) {
			expect(getItemEquipmentSlot(item.itemClass)).toBe(
				EXPECTED_SLOTS[item.itemClass],
			);
		}
	});
});

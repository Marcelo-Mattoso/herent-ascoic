import type { ItemCard } from "../data/cardTypes";

import type { HeroRecord, ItemSlotType } from "../state/heroState";
import { cardById } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

export const EQUIPMENT_SLOTS: readonly ItemSlotType[] = [
	"clothing1",
	"clothing2",
	"hand1",
	"hand2",
	"amulet",
];

export function itemFitsSlot(item: ItemCard, slot: ItemSlotType): boolean {
	if (item.equipmentSlot === "clothing")
		return slot === "clothing1" || slot === "clothing2";
	if (item.equipmentSlot === "one_hand" || item.equipmentSlot === "two_hands")
		return slot === "hand1" || slot === "hand2";
	return item.equipmentSlot === "amulet" && slot === "amulet";
}

export function itemAllowedForHero(item: ItemCard, hero: HeroRecord): boolean {
	return !item.allowedHeroIds || item.allowedHeroIds.includes(hero.cardId);
}

export function equippedItemAt(engine: GameEngine, 
	hero: HeroRecord,
	slot: ItemSlotType,
): string | undefined {
	if (slot === "hand2" && !hero.activeItems.hand2 && hero.activeItems.hand1) {
		const item = cardById(engine, hero.activeItems.hand1);
		if (item?.type === "item" && item.equipmentSlot === "two_hands")
			return item.id;
	}
	return hero.activeItems[slot];
}

export function freeEquipmentSlot(engine: GameEngine, 
	hero: HeroRecord,
	item: ItemCard,
): ItemSlotType | null {
	if (
		!itemAllowedForHero(item, hero) ||
		!item.equipmentSlot ||
		Object.values(hero.activeItems).includes(item.id)
	)
		return null;
	if (item.equipmentSlot === "two_hands") {
		return !equippedItemAt(engine, hero, "hand1") && !equippedItemAt(engine, hero, "hand2")
			? "hand1"
			: null;
	}
	return (
		EQUIPMENT_SLOTS.find(
			(slot) => itemFitsSlot(item, slot) && !equippedItemAt(engine, hero, slot),
		) ?? null
	);
}

export function placeEquipment(engine: GameEngine, 
	hero: HeroRecord,
	item: ItemCard,
	requestedSlot?: ItemSlotType,
): { hero: HeroRecord; displaced: string[] } | null {
	if (!item.equipmentSlot || !itemAllowedForHero(item, hero)) return null;
	if (Object.values(hero.activeItems).includes(item.id)) return null;
	if (requestedSlot && !itemFitsSlot(item, requestedSlot)) return null;
	const slot = requestedSlot ?? freeEquipmentSlot(engine, hero, item);
	if (!slot) return null;
	const conflicts =
		item.equipmentSlot === "two_hands"
			? [equippedItemAt(engine, hero, "hand1"), equippedItemAt(engine, hero, "hand2")]
			: [equippedItemAt(engine, hero, slot)];
	const displaced = [
		...new Set(conflicts.filter((id): id is string => !!id && id !== item.id)),
	];
	const activeItems = { ...hero.activeItems };
	for (const [occupiedSlot, id] of Object.entries(activeItems)) {
		if (id && displaced.includes(id))
			delete activeItems[occupiedSlot as ItemSlotType];
	}
	if (item.equipmentSlot === "two_hands") {
		delete activeItems.hand2;
		activeItems.hand1 = item.id;
	} else {
		activeItems[slot] = item.id;
	}
	return { hero: { ...hero, activeItems }, displaced };
}

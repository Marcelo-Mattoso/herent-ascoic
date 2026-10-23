import type { ItemCard } from "../data/cardTypes";
import { BACKPACK_LIMIT } from "../config/defaults";
import { getCardById } from "../data/cards";
import type { HeroState, ItemSlotType } from "../state/heroState";

export const EQUIPMENT_SLOTS: readonly ItemSlotType[] = [
	"clothing1",
	"clothing2",
	"hand1",
	"hand2",
	"amulet",
];
export const BACKPACK_CAPACITY = BACKPACK_LIMIT ?? 3;

export function itemFitsSlot(item: ItemCard, slot: ItemSlotType): boolean {
	if (item.equipmentSlot === "clothing")
		return slot === "clothing1" || slot === "clothing2";
	if (item.equipmentSlot === "one_hand" || item.equipmentSlot === "two_hands")
		return slot === "hand1" || slot === "hand2";
	return item.equipmentSlot === "amulet" && slot === "amulet";
}

export function itemAllowedForHero(item: ItemCard, hero: HeroState): boolean {
	return !item.allowedHeroIds || item.allowedHeroIds.includes(hero.cardId);
}

export function equippedItemAt(
	hero: HeroState,
	slot: ItemSlotType,
): string | undefined {
	if (slot === "hand2" && !hero.activeItems.hand2 && hero.activeItems.hand1) {
		const item = getCardById(hero.activeItems.hand1);
		if (item?.type === "item" && item.equipmentSlot === "two_hands")
			return item.id;
	}
	return hero.activeItems[slot];
}

export function freeEquipmentSlot(
	hero: HeroState,
	item: ItemCard,
): ItemSlotType | null {
	if (
		!itemAllowedForHero(item, hero) ||
		!item.equipmentSlot ||
		Object.values(hero.activeItems).includes(item.id)
	)
		return null;
	if (item.equipmentSlot === "two_hands") {
		return !equippedItemAt(hero, "hand1") && !equippedItemAt(hero, "hand2")
			? "hand1"
			: null;
	}
	return (
		EQUIPMENT_SLOTS.find(
			(slot) => itemFitsSlot(item, slot) && !equippedItemAt(hero, slot),
		) ?? null
	);
}

export function placeEquipment(
	hero: HeroState,
	item: ItemCard,
	requestedSlot?: ItemSlotType,
): { hero: HeroState; displaced: string[] } | null {
	if (!item.equipmentSlot || !itemAllowedForHero(item, hero)) return null;
	if (Object.values(hero.activeItems).includes(item.id)) return null;
	if (requestedSlot && !itemFitsSlot(item, requestedSlot)) return null;
	const slot = requestedSlot ?? freeEquipmentSlot(hero, item);
	if (!slot) return null;
	const conflicts =
		item.equipmentSlot === "two_hands"
			? [equippedItemAt(hero, "hand1"), equippedItemAt(hero, "hand2")]
			: [equippedItemAt(hero, slot)];
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

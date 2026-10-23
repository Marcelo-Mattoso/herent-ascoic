// Strategy: destino de um item recebido (equipar, mochila ou descartar).
// Default: equipa se o slot estiver livre, caso contrário vai para a mochila.

import type { ItemCard } from "../data/cardTypes";
import { freeEquipmentSlot } from "../rules/equipment";
import type { HeroState, ItemSlotType } from "../state/heroState";

export type ItemDestination = "equip" | "backpack" | "discard";

export function getItemEquipmentSlot(
	item: ItemCard,
	hero: HeroState,
): ItemSlotType | null {
	return freeEquipmentSlot(hero, item);
}

export function defaultItemDestination(
	hero: HeroState,
	item: ItemCard,
): ItemDestination {
	const slot = getItemEquipmentSlot(item, hero);
	if (!slot) return "backpack";
	return "equip";
}

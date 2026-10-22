// Strategy: destino de um item recebido (equipar, mochila ou descartar).
// Default: equipa se o slot estiver livre, caso contrário vai para a mochila.

import { ITEM_CLASS_TO_SLOT } from "../config/defaults";
import type { ItemClass } from "../data/cardTypes";
import type { HeroState, ItemSlotType } from "../state/heroState";

export type ItemDestination = "equip" | "backpack" | "discard";

/** Retorna o slot compatível com a classe do item, ou null se uma classe futura não tiver slot. */
export function getItemEquipmentSlot(
	itemClass: ItemClass,
): ItemSlotType | null {
	return ITEM_CLASS_TO_SLOT[itemClass] as ItemSlotType | null;
}

export function defaultItemDestination(
	hero: HeroState,
	itemClass: ItemClass,
): ItemDestination {
	const slot = getItemEquipmentSlot(itemClass);
	if (!slot) return "backpack";
	if (!hero.activeItems[slot]) return "equip";
	return "backpack";
}

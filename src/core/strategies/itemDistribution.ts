// Strategy: destino de um item recebido (equipar, mochila ou descartar).
// Default: equipa se o slot estiver livre, caso contrário vai para a mochila.

import type { ItemClass } from "../data/cardTypes";
import { ITEM_CLASS_TO_SLOT } from "../config/defaults";
import type { HeroState, ItemSlotType } from "../state/heroState";

export type ItemDestination = "equip" | "backpack" | "discard";

export function defaultItemDestination(
	hero: HeroState,
	itemClass: ItemClass,
): ItemDestination {
	const slot = ITEM_CLASS_TO_SLOT[itemClass] as ItemSlotType | null;
	if (!slot) return "backpack"; // consumíveis sempre vão para mochila
	if (!hero.activeItems[slot]) return "equip";
	return "backpack";
}

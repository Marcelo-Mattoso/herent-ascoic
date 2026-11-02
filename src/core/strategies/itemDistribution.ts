// Strategy: destino de um item recebido (equipar, mochila ou descartar).
// Default: equipa se o slot estiver livre, caso contrário vai para a mochila.

import type { ItemCard } from "../data/cardTypes";
import { freeEquipmentSlot } from "../rules/equipment";
import type { HeroRecord, ItemSlotType } from "../state/heroState";
import type { GameEngine } from "../gameEngine";

export type ItemDestination = "equip" | "backpack" | "discard";

export function getItemEquipmentSlot(engine: GameEngine, 
	item: ItemCard,
	hero: HeroRecord,
): ItemSlotType | null {
	return freeEquipmentSlot(engine, hero, item);
}

export function defaultItemDestination(engine: GameEngine, 
	hero: HeroRecord,
	item: ItemCard,
): ItemDestination {
	const slot = getItemEquipmentSlot(engine, item, hero);
	if (!slot) return "backpack";
	return "equip";
}

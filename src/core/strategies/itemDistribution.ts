// Strategy: destino de um item recebido (equipar, mochila ou descartar).
// Default: equipa se o slot estiver livre, caso contrário vai para a mochila.

import type { EquippableCard } from "../rules/equipment";
import { freeEquipmentSlot } from "../rules/equipment";
import type { HeroRecord, ItemSlotType } from "../state/heroState";
import type { GameEngine } from "../gameEngine";

export type ItemDestination = "equip" | "backpack" | "discard";

export function getItemEquipmentSlot(engine: GameEngine, 
	item: EquippableCard,
	hero: HeroRecord,
): ItemSlotType | null {
	return freeEquipmentSlot(engine, hero, item);
}

export function defaultItemDestination(engine: GameEngine, 
	hero: HeroRecord,
	item: EquippableCard,
): ItemDestination {
	const slot = getItemEquipmentSlot(engine, item, hero);
	if (!slot) return "backpack";
	return "equip";
}

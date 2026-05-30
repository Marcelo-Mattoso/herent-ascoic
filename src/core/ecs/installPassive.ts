// Instala ModifierComponents permanentes para skills passivas (while_*, room_passive).
// Patch-18 Lote F.

import type { SkillDefinition } from "../data/skillTypes";
import type { SkillRef } from "../data/cardTypes";
import type { EntityId, ModifierComponent } from "./types";
import { addComponent, removeComponent, type World } from "./world";

// Remove todos os ModifierComponents instalados por uma skill específica
export function removePassivesBySource(world: World, entityId: EntityId, skillId: string): World {
	return removeComponent(world, entityId, (c) => c.type === "modifier" && (c as ModifierComponent).source === skillId);
}

export function installPassive(
	world: World,
	entityId: EntityId,
	def: SkillDefinition,
	_ref: SkillRef,
): World {
	// Extrai modificadores estáticos do effect DSL da skill passiva
	if (!def.effect) return world;
	let w = world;
	for (const node of def.effect) {
		if (node.kind !== "add_modifier") continue;
		const target = mapPassiveTarget(node.stat);
		if (!target) continue;
		const value = typeof node.value === "number" ? node.value : 0;
		const mod: ModifierComponent = {
			type: "modifier",
			target,
			operation: (node.operation as ModifierComponent["operation"]) ?? "add",
			value,
			source: def.id,
			duration: { kind: "permanent" },
		};
		w = addComponent(w, entityId, mod);
	}
	return w;
}

function mapPassiveTarget(
	stat: string,
): ModifierComponent["target"] | undefined {
	switch (stat) {
		case "damage_bonus": return "damage_dealt";
		case "damage_reduction": return "damage_taken";
		case "tohit_bonus": return "hit_bonus";
		case "tohit_penalty": return "hit_bonus";
		case "dice_count": return "dice_count";
		default: return undefined;
	}
}

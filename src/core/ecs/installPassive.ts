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
	ref: SkillRef,
): World {
	// Extrai modificadores estáticos do effect DSL da skill passiva.
	// Suporta nós p_modifier (YAML v2). Nós p_block são geridos via estado de jogo (flags).
	if (!def.effect) return world;
	let w = world;
	for (const node of def.effect) {
		if (node.kind !== "p_modifier") continue;
		const target = mapPassiveTarget(node.stat);
		if (!target) continue;
		// Resolve $value via ref.params quando o valor é uma variável
		const rawValue = node.value;
		const value =
			typeof rawValue === "number"
				? rawValue
				: typeof rawValue === "string" && rawValue.startsWith("$")
					? (typeof (ref.params as Record<string, unknown>)?.[rawValue.slice(1)] === "number"
						? (ref.params as Record<string, number>)[rawValue.slice(1)]!
						: 0)
					: 0;
		const mod: ModifierComponent = {
			type: "modifier",
			target,
			operation: (node.operation as ModifierComponent["operation"]) ?? "add",
			value,
			source: def.id,
			// Passivos while_in_play ficam atrelados à vida da entidade que os possui.
			duration: { kind: "while_source_in_play" },
			sourceEntityId: entityId,
		};
		w = addComponent(w, entityId, mod);
	}
	return w;
}

function mapPassiveTarget(
	stat: string,
): ModifierComponent["target"] | undefined {
	switch (stat) {
		// v1 legado
		case "damage_bonus": return "damage_dealt";
		case "damage_reduction": return "damage_taken";
		case "tohit_bonus": return "hit_bonus";
		case "tohit_penalty": return "hit_bonus";
		case "dice_count": return "dice_count";
		// v2 (patch-21 Lote E)
		case "s_damage_dealt": return "damage_dealt";
		case "s_damage_reduction": return "damage_taken";
		case "s_hit_bonus": return "hit_bonus";
		case "s_hit_penalty": return "hit_bonus";
		default: return undefined;
	}
}

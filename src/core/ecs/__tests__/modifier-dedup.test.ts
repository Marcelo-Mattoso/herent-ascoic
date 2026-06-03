import { describe, expect, it } from "vitest";
import { resolveEffect } from "../../effects/resolver";
import type { ModifierComponent } from "../types";
import { createEmptyWorld, createEntity, getComponents, upsertEntity } from "../world";
import { createInitialGameState } from "../../state/gameState";
import type { GameState } from "../../state/gameState";
import type { PendingEffect } from "../../effects/stack";

function makeState(entityId: string, entityType: "hero" | "enemy" = "enemy"): GameState {
	let state = createInitialGameState({ heroCardIds: [] });
	let world = createEmptyWorld();
	world = upsertEntity(world, createEntity(entityId, entityType));
	return { ...state, world };
}

function makeModifierPending(
	entityId: string,
	stat: string,
	value: number,
	sourceEntityId: string,
	source: string,
): PendingEffect {
	return {
		id: `pending_${sourceEntityId}`,
		cause: "test",
		source,
		effect: {
			kind: "p_modifier",
			to: entityId,
			stat,
			operation: "add",
			value,
			duration: { kind: "while_in_play" },
			sourceEntityId,
		},
	} as unknown as PendingEffect;
}

describe("modifier dedup (B5 — while_source_in_play)", () => {
	it("aplicar p_modifier while_in_play duas vezes do mesmo source resulta em 1 modifier", () => {
		const entityId = "enemy_1";
		let state = makeState(entityId);

		const pending = makeModifierPending(entityId, "s_damage_reduction", 2, entityId, "skill_charred_plate");
		state = resolveEffect(state, pending);
		state = resolveEffect(state, pending);

		const mods = getComponents<ModifierComponent>(state.world, entityId, "modifier");
		expect(mods).toHaveLength(1);
	});

	it("valor não dobra após múltiplos disparos reativos", () => {
		const entityId = "enemy_1";
		let state = makeState(entityId);

		const pending = makeModifierPending(entityId, "s_hit_penalty", 3, entityId, "skill_gelatinous_body");
		state = resolveEffect(state, pending);
		state = resolveEffect(state, pending);
		state = resolveEffect(state, pending);

		const mods = getComponents<ModifierComponent>(state.world, entityId, "modifier");
		expect(mods).toHaveLength(1);
		// s_hit_penalty vira valor negativo no ECS
		expect(mods[0]!.value).toBe(-3);
	});

	it("modifiers de sourceEntityId distintos não são deduplicados", () => {
		const entityId = "hero_1";
		let state = makeState(entityId, "hero");

		state = resolveEffect(state, makeModifierPending(entityId, "s_damage_reduction", 2, "enemy_1", "skill_charred_plate"));
		state = resolveEffect(state, makeModifierPending(entityId, "s_damage_reduction", 2, "enemy_2", "skill_charred_plate"));

		const mods = getComponents<ModifierComponent>(state.world, entityId, "modifier");
		expect(mods).toHaveLength(2);
	});

	it("modifier sem sourceEntityId (op_active) não sofre dedup", () => {
		const entityId = "hero_1";
		let state = makeState(entityId, "hero");

		// Sem sourceEntityId — não deve dedupar
		const pending: PendingEffect = {
			id: "p1",
			cause: "test",
			source: "some_skill",
			effect: {
				kind: "p_modifier",
				to: entityId,
				stat: "s_damage_dealt",
				operation: "add",
				value: 2,
				duration: { kind: "while_in_play" },
			},
		} as unknown as PendingEffect;

		state = resolveEffect(state, pending);
		state = resolveEffect(state, pending);

		const mods = getComponents<ModifierComponent>(state.world, entityId, "modifier");
		expect(mods).toHaveLength(2);
	});
});

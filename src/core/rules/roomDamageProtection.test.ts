import { describe, expect, it } from "vitest";
import type { AllyCard } from "../data/cardTypes";
import { testEngine } from "../__tests__/testEngine";
import type { GameEngine } from "../gameEngine";
import type { HeroState } from "../state/heroState";
import { createInitialGameState } from "../state/gameState";
import { heroesOf } from "../state/access";
import { settled } from "../__tests__/fixtures";
import { withGame } from "../../engine/state";
import { applyDamage } from "../systems/damageSystem";

const ally: AllyCard = {
	type: "ally", id: "ally_test_room_guard", equipmentSlot: "ally",
	skills: [{ skillId: "item_skill_room_damage_protection", params: { value: 1 } }],
};
const definition = {
	id: "item_skill_room_damage_protection",
	category: "item_skill" as const,
	operate_type: "op_passive" as const,
	target_type: "tgt_self" as const,
	affect_scope: "scp_single" as const,
	affect_object: "obj_friend" as const,
	effect: [{
		kind: "p_modifier" as const, to: "$source",
		stat: "s_room_damage_reduction", operation: "add" as const,
		value: "$value", duration: { kind: "while_in_play" as const },
	}],
};
const engine = {
	...testEngine,
	content: {
		...testEngine.content,
		hasCard(id: string) { return id === ally.id || testEngine.content.hasCard(id); },
		card(id: string) { return id === ally.id ? ally : testEngine.content.card(id); },
		abilitiesOf(id: string) {
			return id === ally.id
				? [{ def: definition, ref: ally.skills[0]! }]
				: testEngine.content.abilitiesOf(id);
		},
	},
} as GameEngine;

function heroWithCompanion() {
	const hero: HeroState = {
		id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10,
		damage: 3, hitBonus: 0, dice: 2, activeItems: { ally: ally.id },
		backpack: [], usedPowers: {}, conditions: [], status: "active",
		playerIndex: 0, xp: 0,
	};
	return settled(withGame(createInitialGameState({ heroCardIds: [] }), (g) => ({
		...g, heroes: [hero],
	})));
}

describe("proteção por origem ambiental", () => {
	it("reduz dano de sala e não interfere em dano comum", () => {
		const before = heroWithCompanion();
		const fromRoom = applyDamage(engine, before, "h1", 3, {
			sourceId: "test_room_effect", damageType: "physical", origin: "room",
		});
		const ordinary = applyDamage(engine, before, "h1", 3, {
			sourceId: "test_enemy_effect", damageType: "physical",
		});
		expect(heroesOf(fromRoom)[0]?.currentLife).toBe(8);
		expect(heroesOf(ordinary)[0]?.currentLife).toBe(7);
	});
});

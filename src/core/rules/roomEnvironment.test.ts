import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import type { GameEngine } from "../gameEngine";
import type { HeroState } from "../state/heroState";
import { createInitialGameState } from "../state/gameState";
import { heroesOf } from "../state/access";
import { settled } from "../__tests__/fixtures";
import { withGame } from "../../engine/state";
import { conditionsApply } from "./itemEffects";

const DARK_ROOM = "room_dead_torches_passage";
const tagged = {
	def: {
		id: "test_environment_darkness",
		category: "dungeon_skill" as const,
		operate_type: "op_triggered" as const,
		trigger: { event: "evt_combat_start" as const },
		rules: { environmentTag: "darkness" },
		effect: [],
		target_type: "tgt_none" as const,
		affect_scope: "scp_none" as const,
		affect_object: "obj_all" as const,
	},
	ref: { skillId: "test_environment_darkness" },
};
const engine = {
	...testEngine,
	content: {
		...testEngine.content,
		abilitiesOf(id: string) {
			return id === DARK_ROOM ? [tagged] : testEngine.content.abilitiesOf(id);
		},
	},
} as GameEngine;
const hero: HeroState = {
	id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10,
	damage: 3, hitBonus: 0, dice: 2, activeItems: {}, backpack: [],
	usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0,
};

function inRoom(roomId: string | null) {
	return settled(withGame(createInitialGameState({ heroCardIds: [] }), (g) => ({
		...g, heroes: [hero],
		currentRoom: roomId ? {
			cardId: roomId, exits: 1, currentEnemies: 0, reward: 0,
			rewardType: "item" as const, effect: "", xp: 0, status: "active" as const,
		} : null,
	})));
}

describe("tags ambientais de sala", () => {
	it("só ativa proteção contextual quando a sala possui a tag declarada", () => {
		const active = inRoom(DARK_ROOM);
		const normal = inRoom("room_narrow_corridor");
		const condition = [{ kind: "room_has_tag" as const, tag: "darkness" }];
		expect(conditionsApply(engine, condition, active, heroesOf(active)[0]!)).toBe(true);
		expect(conditionsApply(engine, condition, normal, heroesOf(normal)[0]!)).toBe(false);
		expect(conditionsApply(engine, condition, inRoom(null), heroesOf(inRoom(null))[0]!)).toBe(false);
	});
});

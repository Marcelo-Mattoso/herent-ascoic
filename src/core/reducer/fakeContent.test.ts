import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/compose";
import { seededDice } from "../../engine/dice";
import { createAscensaoKinds } from "../composition";
import { testEngine } from "../__tests__/testEngine";
import type { AnyCard, SkillRef } from "../data/cardTypes";
import type { SkillDefinition } from "../data/skillTypes";
import { getModifierTotal } from "../ecs/world";
import type {
	GameBalance,
	GameContent,
	GameKinds,
	GameFlow,
	GameEngine,
	GameTransitions,
} from "../gameEngine";
import { gameVersion } from "../gameEngine";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import { createReducer } from "./index";
import { heroesOf } from "../state/access";
import { gameOf } from "../../engine/state";

const SKILL: SkillDefinition = {
	id: "fake_skill_vigor",
	category: "hero_skill",
	operate_type: "op_passive",
	target_type: "tgt_self",
	affect_scope: "scp_single",
	affect_object: "obj_friend",
	effect: [
		{
			kind: "p_modifier",
			stat: "s_damage_dealt",
			operation: "add",
			value: "$value",
			duration: { kind: "while_in_play" },
		},
	],
} as unknown as SkillDefinition;

const CARDS: readonly AnyCard[] = [
	{
		type: "hero",
		id: "fake_hero",
		diceByColor: [1, 1, 1, 1, 1],
		life: [7, 7, 7, 7, 7],
		hitBonus: [1, 1, 1, 1, 1],
		damage: 1,
		skills: [{ skillId: SKILL.id, params: { value: 3 } }],
	},
	{
		type: "boss",
		id: "fake_boss",
		lifeBase: 5,
		hitBonusBase: 1,
		damage: 1,
		dice: 3,
		skills: [],
	},
	{
		type: "room",
		id: "fake_room",
		exits: 1,
		enemiesByPlayers: [1, 1, 1, 1],
		reward: 1,
		rewardType: "item",
		skills: [],
	},
	{
		type: "creature",
		id: "fake_creature",
		diceByColor: [1, 1, 1, 1, 1],
		life: [3, 3, 3, 3, 3],
		hitBonus: [1, 1, 1, 1, 1],
		damage: 1,
		xp: 1,
		reward: 1,
		rewardType: "item",
		skills: [],
	},
	{ type: "item", id: "fake_item", itemClass: "consumable", skills: [] },
	{ type: "artifact", id: "fake_artifact", countsAs: "artifact", skills: [] },
];

const NAMES: Record<string, string> = {
	fake_hero: "Heroi Inventado",
	fake_boss: "Chefe Inventado",
};

const fakeContent: GameContent = {
	expansionOf: () => "fake",
	card(id) {
		const card = CARDS.find((c) => c.id === id);
		if (!card) throw new Error(`Carta inexistente: ${id}`);
		return card;
	},
	hasCard: (id) => CARDS.some((c) => c.id === id),
	cards: () => CARDS,
	cardsOfType: ((type: AnyCard["type"]) =>
		CARDS.filter((c) => c.type === type)) as GameContent["cardsOfType"],
	abilitiesOf(cardId) {
		const card = CARDS.find((c) => c.id === cardId);
		return (card?.skills ?? []).map((ref: SkillRef) => ({ def: SKILL, ref }));
	},
	ability(id) {
		if (id !== SKILL.id) throw new Error(`Habilidade inexistente: ${id}`);
		return SKILL;
	},
	hasAbility: (id) => id === SKILL.id,
	grants: () => [],
	abilityDef: () => null,
	script: () => null,
	continuationOf: () => null,
	text: (key, params) => NAMES[String(params?.["id"])] ?? key,
};

function fakeEngine(): GameEngine {
	return createEngine<
		GameState,
		AnyCard,
		SkillDefinition,
		GameBalance,
		GameTransitions,
		GameContent,
		GameKinds,
		GameFlow
	>({
		kinds: createAscensaoKinds(),
		ruleset: {
			id: "fake",
			version: "9.9.9",
			balance: testEngine.ruleset.balance,
			transitions: testEngine.ruleset.transitions,
			eventRules: testEngine.ruleset.eventRules,
		},
		content: fakeContent,
		dice: seededDice,
		requirements: testEngine.requirements,
		scopes: testEngine.scopes,
		flow: testEngine.flow,
	});
}

describe("core com ContentPort falso", () => {
	it("START_GAME monta o jogo só com carta e skill inventadas", () => {
		const engine = fakeEngine();
		const reduce = createReducer(engine);
		const initial = createInitialGameState({ heroCardIds: ["fake_hero"] });

		const started = reduce(initial, {
			type: "START_GAME",
			payload: {
				heroCardIds: ["fake_hero"],
				bossCardId: "fake_boss",
				seed: 7,
			},
		});

		const hero = heroesOf(started)[0];
		expect(hero?.cardId).toBe("fake_hero");
		expect(hero?.maxLife).toBe(7);
		expect(gameOf(started).currentRoom?.cardId).toBe("fake_room");
		expect(gameOf(started).eventLog[0]).toContain("Heroi Inventado");
		expect(gameOf(started).eventLog[0]).toContain("Chefe Inventado");
		expect(
			getModifierTotal(gameOf(started).world, hero?.id ?? "", "damage_dealt"),
		).toBe(3);
		expect(gameVersion(engine)).toBe("9.9.9");
	});

	it("SPAWN_ENEMIES usa a criatura inventada", () => {
		const reduce = createReducer(fakeEngine());
		let state = reduce(createInitialGameState({ heroCardIds: ["fake_hero"] }), {
			type: "START_GAME",
			payload: { heroCardIds: ["fake_hero"], bossCardId: "fake_boss", seed: 7 },
		});
		state = reduce(state, { type: "RESOLVE_ROOM_EFFECT" });
		state = reduce(state, { type: "SPAWN_ENEMIES" });
		expect(gameOf(state).activeEnemies.map((e) => e.cardId)).toEqual(["fake_creature"]);
	});

	it("a engine real não conhece as cartas inventadas", () => {
		expect(testEngine.content.hasCard("fake_hero")).toBe(false);
	});
});

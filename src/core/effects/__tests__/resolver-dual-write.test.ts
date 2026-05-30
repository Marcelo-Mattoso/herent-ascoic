import { describe, expect, it } from "vitest";
import { getModifierTotal } from "../../ecs/world";
import { syncEntityFromHero } from "../../ecs/sync";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { addPending, createEmptyEffectStack } from "../stack";
import { drainStack } from "../resolver";

function makeHero(id = "hero_warrior"): HeroState {
	return {
		id,
		cardId: "hero_unbreakable_bastion",
		cardName: "Guerreiro",
		maxLife: 14,
		currentLife: 14,
		damage: 4,
		hitBonus: 1,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
}

function makeEnemy(): EnemyState {
	return {
		id: "enemy_goblin",
		cardId: "creature_dark_cave_goblin",
		cardName: "Goblin",
		maxLife: 5,
		currentLife: 5,
		damage: 2,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};
}

function makeState(): GameState {
	const hero = makeHero();
	const base = createInitialGameState({ heroCardNames: ["Guerreiro"] });
	let world = base.world;
	world = syncEntityFromHero(world, hero);
	return {
		...base,
		heroes: [hero],
		activeEnemies: [makeEnemy()],
		combat: createEmptyCombatState(),
		world,
	};
}

function pushModifier(
	state: GameState,
	heroId: string,
	stat: string,
	value: number,
	source: string,
	durationKind: string,
): GameState {
	const stack = createEmptyEffectStack();
	const filledStack = addPending(stack, {
		cause: "test",
		effect: {
			kind: "add_modifier",
			to: heroId,
			stat,
			value,
			operation: "add",
			duration: { kind: durationKind },
		},
		source,
	});
	return drainStack({ ...state, effectStack: filledStack });
}

describe("add_modifier dual-write", () => {
	it("damage_reduction: escreve em combat.damageReduction E no ECS world", () => {
		const state = makeState();
		const heroId = "hero_warrior";

		const after = pushModifier(state, heroId, "damage_reduction", 1, "power_unbreakable_bastion_guard", "until_end_of_round");

		// Legacy
		expect(after.combat?.damageReduction[heroId]).toBe(1);

		// ECS: damage_reduction DSL → damage_taken ECS, valor negativo (debuff de dano sofrido)
		expect(getModifierTotal(after.world, heroId, "damage_taken")).toBe(-1);
	});

	it("damage_bonus: escreve em bonusNextAttack E no ECS world", () => {
		const state = makeState();
		const heroId = "hero_warrior";

		const after = pushModifier(state, heroId, "damage_bonus", 3, "skill_test_bonus", "once");

		// Legacy
		const legacyBonus = after.combat?.bonusNextAttack[heroId] ?? [];
		expect(legacyBonus.some((e) => e.value === 3)).toBe(true);

		// ECS
		expect(getModifierTotal(after.world, heroId, "damage_dealt")).toBe(3);
	});

	it("tohit_penalty: escreve em tohitPenaltyByHero E no ECS world (negativo)", () => {
		const state = makeState();
		const heroId = "hero_warrior";

		const after = pushModifier(state, heroId, "tohit_penalty", 2, "skill_scorching_heat", "until_end_of_combat");

		// Legacy
		expect(after.combat?.tohitPenaltyByHero[heroId]).toBe(2);

		// ECS: tohit_penalty → hit_bonus com valor negativo
		expect(getModifierTotal(after.world, heroId, "hit_bonus")).toBe(-2);
	});
});

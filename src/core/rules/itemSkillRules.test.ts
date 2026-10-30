import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { createInitialGameState, type GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import {
	collectHeroDamageBonusesFromItems,
	collectHeroHitBonusesFromItems,
	collectHeroLifeDrainFromItems,
	totalItemValue,
} from "./itemEffects";
import { withGame } from "../../engine/state";

function withItems(itemIds: Record<string, string>): {
	game: GameState;
	hero: HeroState;
} {
	const base = createInitialGameState({ heroCardIds: [] });
	const hero: HeroState = {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 5,
		damage: 4,
		hitBonus: 0,
		dice: 2,
		activeItems: itemIds,
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
	return { game: withGame(base, (prevGame) => ({ ...prevGame, heroes: [hero], status: "REWARD_PHASE" })), hero };
}

describe("regras de habilidade de item declaradas nos dados", () => {
	it("borda mortal só dá dano com margem de acerto 4 ou mais", () => {
		const { game, hero } = withItems({ hand1: "item_rusty_dagger" });
		const dmg = (margin: number) =>
			totalItemValue(
				collectHeroDamageBonusesFromItems(testEngine, hero, game, undefined, margin),
			);
		expect(dmg(3)).toBe(0);
		expect(dmg(4)).toBe(1);
		expect(
			totalItemValue(collectHeroHitBonusesFromItems(testEngine, hero, game)),
		).toBe(1);
	});

	it("dreno de vida só existe no item que declara o dreno", () => {
		const scythe = withItems({ hand1: "item_deep_veil_scythe" });
		expect(
			collectHeroLifeDrainFromItems(testEngine, scythe.hero, scythe.game),
		).toHaveLength(1);
		const dagger = withItems({ hand1: "item_rusty_dagger" });
		expect(
			collectHeroLifeDrainFromItems(testEngine, dagger.hero, dagger.game),
		).toHaveLength(0);
	});

	it("foco do caçador soma o parâmetro ao acerto do portador", () => {
		const { game, hero } = withItems({ amulet: "item_low_flame_charm" });
		expect(
			totalItemValue(collectHeroHitBonusesFromItems(testEngine, hero, game)),
		).toBe(2);
	});
});

describe("regra roxa vive no pacote do jogo", () => {
	it("stat roxo, dano roxo e índice do despertar são resolvidos pelo registro", () => {
		const spec = testEngine.kinds.ref<{ target: string; damageType: string }>(
			"modifier_stat",
			"s_purple_damage_reduction",
			undefined as never,
		);
		expect(spec).toMatchObject({
			target: "purple_damage_taken",
			damageType: "purple",
		});
		const physical = testEngine.kinds.ref<{ target: string }>(
			"modifier_stat",
			"s_hit_bonus",
			undefined as never,
		);
		expect(physical?.target).toBe("hit_bonus");
		const purpleSkills = testEngine.content
			.cards()
			.flatMap((card) => testEngine.content.abilitiesOf(card.id))
			.filter(({ def }) => def.category === "monster_purple");
		expect(purpleSkills.length).toBeGreaterThan(0);
		for (const { def } of purpleSkills) {
			expect(def.rules?.damageType, def.id).toBe("purple");
		}
	});
});

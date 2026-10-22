import { describe, expect, it } from "vitest";
import type { HeroState } from "../state/heroState";
import {
	equipItem,
	hasBackpackSpace,
	itemReadiness,
	setItemReadiness,
	unequipItem,
} from "./itemDistribution";
import { manualItemUnavailableReason } from "../rules/itemEffects";
import { createInitialGameState } from "../state/gameState";
import { handlePrepareItems } from "../reducer/reward";
import { handleInvMove } from "../reducer/reward";

function hero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		itemReadiness: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

describe("Hero Tray", () => {
	it("aceita duas vestimentas e impede a terceira", () => {
		const first = equipItem(hero(), "hood", "clothing")!;
		const second = equipItem(first, "boots", "clothing")!;
		expect(second.activeItems).toMatchObject({
			clothing1: "hood",
			clothing2: "boots",
		});
		expect(equipItem(second, "armor", "clothing")).toBeNull();
	});

	it("aceita duas mãos simples, bloqueia a terceira e equipa duas mãos atomicamente", () => {
		const one = equipItem(hero(), "sword", "one_hand")!;
		const two = equipItem(one, "shield", "one_hand")!;
		expect(equipItem(two, "potion", "one_hand")).toBeNull();
		expect(equipItem(two, "axe", "two_hands")).toBeNull();

		const axe = equipItem(hero(), "axe", "two_hands")!;
		expect(axe.activeItems).toMatchObject({ hand1: "axe", hand2: "axe" });
		expect(equipItem(axe, "shield", "one_hand")).toBeNull();
		expect(unequipItem(axe, "axe").activeItems).toEqual({});
	});

	it("aceita um amuleto, limita a mochila a três e mantém o estado de exaustão", () => {
		const amulet = equipItem(hero(), "charm", "amulet")!;
		expect(equipItem(amulet, "second-charm", "amulet")).toBeNull();
		expect(hasBackpackSpace(hero({ backpack: ["a", "b", "c"] }))).toBe(false);

		const exhausted = setItemReadiness(amulet, "charm", "exhausted");
		expect(itemReadiness(exhausted, "charm")).toBe("exhausted");
		expect(exhausted.activeItems.amulet).toBe("charm");
	});

	it("não permite usar item na mochila e prepara novamente o item equipado", () => {
		const backpackHero = hero({ backpack: ["item_lesser_vigor_potion"] });
		const base = {
			...createInitialGameState({ heroCardIds: [] }),
			status: "REWARD_PHASE" as const,
			heroes: [backpackHero],
		};
		expect(
			manualItemUnavailableReason(base, "h1", "item_lesser_vigor_potion"),
		).toContain("mochila não podem ser usados");

		const equipped = setItemReadiness(
			equipItem(hero(), "item_low_flame_charm", "amulet")!,
			"item_low_flame_charm",
			"exhausted",
		);
		const prepared = handlePrepareItems({ ...base, heroes: [equipped] });
		expect(itemReadiness(prepared.heroes[0]!, "item_low_flame_charm")).toBe(
			"ready",
		);
	});

	it("transfere entre heróis e faz rollback quando o destino não comporta o item", () => {
		const source = hero({ backpack: ["item_rusty_dagger"] });
		const recipient = hero({
			id: "h2",
			activeItems: {
				hand1: "item_last_light_sword",
				hand2: "item_cracked_shield",
			},
		});
		const state = {
			...createInitialGameState({ heroCardIds: [] }),
			status: "REWARD_PHASE" as const,
			heroes: [source, recipient],
		};
		const rejected = handleInvMove(
			state,
			"item_rusty_dagger",
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h2" },
		);
		expect(rejected).toBe(state);

		const moved = handleInvMove(
			{ ...state, heroes: [source, hero({ id: "h2" })] },
			"item_rusty_dagger",
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h2" },
		);
		expect(moved.heroes.find((h) => h.id === "h2")?.activeItems.hand1).toBe(
			"item_rusty_dagger",
		);
	});
});

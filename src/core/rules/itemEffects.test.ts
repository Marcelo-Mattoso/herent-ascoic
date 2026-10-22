import { describe, expect, it } from "vitest";
import { createEmptyCombatState } from "../state/combatState";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import {
	findHeroItemLocation, formatItemBreakdown,
	itemActivationId, itemCanBeUsedManually, itemShouldBeConsumed, itemUseTargetIds,
	manualItemUnavailableReason, removeHeroItem, totalItemValue,
} from "./itemEffects";

function state(): GameState {
	const base = createInitialGameState({ heroCardIds: [] });
	const hero: HeroState = { id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 8, damage: 3, hitBonus: 0, dice: 2, impeto: 0, activeItems: { weapon: "item_rusty_dagger" }, backpack: ["item_lesser_vigor_potion"], usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0 };
	return { ...base, heroes: [hero], activeEnemies: [{ id: "e1", cardId: "creature_dark_cave_goblin", maxLife: 5, currentLife: 5, damage: 1, hitBonus: 0, dice: 1, tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active" }], combat: { ...createEmptyCombatState(), pairs: [{ heroId: "h1", enemyId: "e1" }] } };
}

describe("efeitos de itens — utilidades", () => {
	it("localiza e remove itens equipados ou na mochila", () => {
		const s = state();
		const hero = s.heroes[0]!;
		expect(itemActivationId("h1", "x")).toBe("h1:x");
		expect(findHeroItemLocation(hero, "item_rusty_dagger")).toEqual({ kind: "active", slot: "weapon" });
		expect(findHeroItemLocation(hero, "item_lesser_vigor_potion")).toEqual({ kind: "backpack", index: 0 });
		expect(findHeroItemLocation(hero, "missing")).toBeNull();
		expect(removeHeroItem(s, "h1", "item_rusty_dagger").heroes[0]?.activeItems.weapon).toBeUndefined();
		expect(removeHeroItem(s, "h1", "item_lesser_vigor_potion").heroes[0]?.backpack).toEqual([]);
	});

	it("calcula destino de alvo e regras de consumo", () => {
		const s = state();
		const enemyDef = { target_type: "tgt_enemy", affect_scope: "scp_single" } as never;
		const selfDef = { target_type: "tgt_self", affect_scope: "scp_single" } as never;
		const noTarget = { target_type: "tgt_item", affect_scope: "scp_none" } as never;
		expect(itemUseTargetIds(s, enemyDef, "h1")).toEqual(["e1"]);
		expect(itemUseTargetIds(s, selfDef, "h1", "h2")).toEqual(["h2"]);
		expect(itemUseTargetIds(s, noTarget, "h1")).toEqual([]);
		expect(itemShouldBeConsumed("item_lesser_vigor_potion")).toBe(true);
		expect(itemShouldBeConsumed("item_ancient_iron_key")).toBe(false);
		expect(itemCanBeUsedManually({ operate_type: "op_active" } as never)).toBe(true);
		expect(itemCanBeUsedManually({ operate_type: "op_triggered", effect: [{ kind: "i_draw", pile: "dungeon", count: 1 }] } as never)).toBe(true);
	});

	it("só libera item da mochila durante a organização de espólios", () => {
		const outsideRewards = state();
		expect(
			manualItemUnavailableReason(
				outsideRewards,
				"h1",
				"item_lesser_vigor_potion",
			),
		).toContain("organização de espólios");
		expect(
			manualItemUnavailableReason(
				{ ...outsideRewards, status: "REWARD_PHASE" },
				"h1",
				"item_lesser_vigor_potion",
			),
		).toBeNull();
	});

	it("soma e formata somente modificadores relevantes", () => {
		const values = [{ source: "A", value: 2 }, { source: "B", value: 0 }, { source: "C", value: -1 }];
		expect(totalItemValue(values)).toBe(1);
		expect(formatItemBreakdown(values, "+")).toEqual(["A +2", "C +-1"]);
	});
});

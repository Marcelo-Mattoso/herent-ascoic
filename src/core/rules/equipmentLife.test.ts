import { describe, expect, it } from "vitest";
import type { AllyCard, ItemCard } from "../data/cardTypes";
import type { GameEngine } from "../gameEngine";
import { testEngine } from "../__tests__/testEngine";
import { createInitialGameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { heroesOf } from "../state/access";
import { settled } from "../__tests__/fixtures";
import { gameOf, withGame } from "../../engine/state";
import { itemFitsSlot } from "./equipment";
import { equippedMaximumLifeBonus } from "./equipmentLife";
import { moveInventoryItem } from "./inventoryMoves";

const ALLY = "ally_test_guardian";
const ARMOR = "item_test_vitality_armor";
const card: AllyCard = {
	type: "ally",
	id: ALLY,
	equipmentSlot: "ally",
	skills: [{ skillId: "item_skill_equipped_max_life", params: { value: 6 } }],
};
const armor: ItemCard = {
	type: "item", id: ARMOR, itemClass: "equipment", equipmentSlot: "clothing",
	skills: [{ skillId: "item_skill_equipped_max_life", params: { value: 6 } }],
};
const definition = {
	id: "item_skill_equipped_max_life",
	category: "item_skill" as const,
	operate_type: "op_passive" as const,
	target_type: "tgt_self" as const,
	affect_scope: "scp_single" as const,
	affect_object: "obj_friend" as const,
	effect: [{
		kind: "p_modifier" as const,
		to: "$source",
		stat: "s_max_life",
		operation: "add" as const,
		value: "$value",
		duration: { kind: "while_in_play" as const },
	}],
};
const engine = {
	...testEngine,
	content: {
		...testEngine.content,
		hasCard(id: string) { return id === ALLY || id === ARMOR || testEngine.content.hasCard(id); },
		card(id: string) { return id === ALLY ? card : id === ARMOR ? armor : testEngine.content.card(id); },
		abilitiesOf(id: string) {
			return id === ALLY || id === ARMOR
				? [{ def: definition, ref: id === ALLY ? card.skills[0]! : armor.skills[0]! }]
				: testEngine.content.abilitiesOf(id);
		},
	},
} as GameEngine;

function state(rewardId = ALLY) {
	const hero: HeroState = {
		id: "h1", cardId: "hero_crimson_barbarian",
		maxLife: 10, currentLife: 4, damage: 3, hitBonus: 0, dice: 2,
		activeItems: {}, backpack: [], usedPowers: {}, conditions: [],
		status: "active", playerIndex: 0, xp: 0,
	};
	return settled(withGame(createInitialGameState({ heroCardIds: [] }), (g) => ({
		...g, status: "REWARD_PHASE", heroes: [hero],
		pendingRewards: [{ type: "item", cardId: rewardId, requiresBearer: false }],
	})));
}

describe("aliados: slot e Vida máxima derivados da fonte ativa", () => {
	it("reconhece somente o slot próprio do aliado", () => {
		expect(itemFitsSlot(card, "ally")).toBe(true);
		expect(itemFitsSlot(card, "amulet")).toBe(false);
		expect(itemFitsSlot(card, "hand1")).toBe(false);
	});

	it("dispensar um aliado reverte o bônus de Vida e impede novo recrutamento", () => {
		// Cada dispensa é definitiva: testar ciclos completos em partidas distintas.
		for (let i = 0; i < 3; i++) {
			let game = state();
			const equipped = moveInventoryItem(engine, game, ALLY,
				{ kind: "mesa" }, { kind: "hero_equip", heroId: "h1" });
			expect(equipped).not.toBeNull();
			game = equipped!;
			expect(heroesOf(game)[0]).toMatchObject({
				maxLife: 16, currentLife: 4, activeItems: { ally: ALLY },
			});
			expect(equippedMaximumLifeBonus(engine, gameOf(game).heroes[0]!, 0)).toBe(6);
			const removed = moveInventoryItem(engine, game, ALLY,
				{ kind: "hero_slot", heroId: "h1", slotType: "ally" }, { kind: "mesa" });
			expect(removed).not.toBeNull();
			game = removed!;
			expect(heroesOf(game)[0]).toMatchObject({ maxLife: 10, currentLife: 4 });
			expect(game.game.retiredAllyIds).toContain(ALLY);
			expect(moveInventoryItem(engine, game, ALLY,
				{ kind: "mesa" }, { kind: "hero_equip", heroId: "h1" })).toBeNull();
		}
	});

	it("equipamento reutilizável não acumula Vida após vários ciclos", () => {
		let game = state(ARMOR);
		for (let i = 0; i < 3; i++) {
			const equipped = moveInventoryItem(engine, game, ARMOR,
				{ kind: "mesa" }, { kind: "hero_equip", heroId: "h1" });
			expect(equipped).not.toBeNull();
			game = equipped!;
			expect(heroesOf(game)[0]).toMatchObject({
				maxLife: 16, currentLife: 4, activeItems: { clothing1: ARMOR },
			});
			const removed = moveInventoryItem(engine, game, ARMOR,
				{ kind: "hero_slot", heroId: "h1", slotType: "clothing1" }, { kind: "mesa" });
			expect(removed).not.toBeNull();
			game = removed!;
			expect(heroesOf(game)[0]).toMatchObject({ maxLife: 10, currentLife: 4 });
		}
	});

	it("limita Vida atual ao desequipar, sem causar cura ao equipar", () => {
		const equipped = moveInventoryItem(engine, state(), ALLY,
			{ kind: "mesa" }, { kind: "hero_equip", heroId: "h1" })!;
		const healed = withGame(equipped, (g) => ({ ...g })); // troca de registro não deve criar vida
		expect(heroesOf(healed)[0]?.currentLife).toBe(4);
	});
});

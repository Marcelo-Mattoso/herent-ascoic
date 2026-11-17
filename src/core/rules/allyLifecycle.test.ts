import { describe, expect, it } from "vitest";
import type { AllyCard } from "../data/cardTypes";
import { testEngine } from "../__tests__/testEngine";
import type { GameEngine } from "../gameEngine";
import type { HeroState } from "../state/heroState";
import { createInitialGameState } from "../state/gameState";
import { heroesOf, deckOf, withDecks, decksOf } from "../state/access";
import { settled } from "../__tests__/fixtures";
import { gameOf, withGame } from "../../engine/state";
import { moveInventoryItem } from "./inventoryMoves";
import { handleChooseItemDestination, handleInvDescartarMesa } from "../reducer/reward";
import { isRetiredAlly, retireAllies } from "./allyLifecycle";

const GUARDIAN = "ally_test_guardian";
const SCOUT = "ally_test_scout";
const ally = (id: string): AllyCard => ({
	type: "ally", id, equipmentSlot: "ally", skills: [],
});
const companions = new Map([GUARDIAN, SCOUT].map((id) => [id, ally(id)]));
const engine = {
	...testEngine,
	content: {
		...testEngine.content,
		hasCard(id: string) { return companions.has(id) || testEngine.content.hasCard(id); },
		card(id: string) { return companions.get(id) ?? testEngine.content.card(id); },
	},
} as GameEngine;

function hero(id: string): HeroState {
	return {
		id, cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10,
		damage: 3, hitBonus: 0, dice: 2, activeItems: {}, backpack: [],
		usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0,
	};
}

function initial() {
	return settled(withGame(createInitialGameState({ heroCardIds: [] }), (g) => ({
		...g, heroes: [hero("h1"), hero("h2")], status: "REWARD_PHASE",
		pendingRewards: [{ cardId: GUARDIAN, type: "item" as const, requiresBearer: false }],
	})));
}
const mesa = { kind: "mesa" as const };
const equip = (heroId: string) => ({ kind: "hero_equip" as const, heroId, slotType: "amulet" as const });
const slot = (heroId: string) => ({ kind: "hero_slot" as const, heroId, slotType: "amulet" as const });

describe("aliados são permanentes apenas enquanto equipados", () => {
	it("não permite colocar aliados na mochila por ação direta ou recompensa", () => {
		const state = initial();
		expect(moveInventoryItem(engine, state, GUARDIAN, mesa, {
			kind: "hero_backpack", heroId: "h1",
		})).toBeNull();
		expect(handleChooseItemDestination(engine, state, "h1", "backpack")).toBe(state);
		expect(heroesOf(state)[0]?.backpack).toEqual([]);
	});

	it("recruta diretamente e não retira o aliado se ele trocar de herói", () => {
		const recruited = moveInventoryItem(engine, initial(), GUARDIAN, mesa, equip("h1"))!;
		expect(heroesOf(recruited)[0]?.activeItems.amulet).toBe(GUARDIAN);
		const transferred = moveInventoryItem(engine, recruited, GUARDIAN, slot("h1"), equip("h2"))!;
		expect(heroesOf(transferred)[0]?.activeItems.amulet).toBeUndefined();
		expect(heroesOf(transferred)[1]?.activeItems.amulet).toBe(GUARDIAN);
		expect(gameOf(transferred).retiredAllyIds).toEqual([]);
	});

	it("dispensar à mesa ou substituir retira o antigo definitivamente", () => {
		const recruited = moveInventoryItem(engine, initial(), GUARDIAN, mesa, equip("h1"))!;
		const newReward = withGame(recruited, (g) => ({ ...g,
			pendingRewards: [{ cardId: SCOUT, type: "item" as const, requiresBearer: false }],
		}));
		const replaced = moveInventoryItem(engine, newReward, SCOUT, mesa, equip("h1"))!;
		expect(heroesOf(replaced)[0]?.activeItems.amulet).toBe(SCOUT);
		expect(isRetiredAlly(replaced, GUARDIAN)).toBe(true);
		expect(replaced.game.pendingRewards.some((r) => r.cardId === GUARDIAN)).toBe(false);
		const dismissed = moveInventoryItem(engine, replaced, SCOUT, slot("h1"), mesa)!;
		expect(isRetiredAlly(dismissed, SCOUT)).toBe(true);
		expect(heroesOf(dismissed)[0]?.activeItems.amulet).toBeUndefined();
		expect(dismissed.game.pendingRewards).toEqual([]);
		const forgedReward = withGame(dismissed, (g) => ({ ...g,
			pendingRewards: [{ cardId: GUARDIAN, type: "item" as const, requiresBearer: false }],
		}));
		expect(moveInventoryItem(engine, forgedReward, GUARDIAN, mesa, equip("h2"))).toBeNull();
	});

	it("recusar ou deixar na mesa grava descarte definitivo", () => {
		const refused = handleChooseItemDestination(engine, initial(), "h1", "discard");
		expect(isRetiredAlly(refused, GUARDIAN)).toBe(true);
		const abandoned = handleInvDescartarMesa(initial(), engine);
		expect(isRetiredAlly(abandoned, GUARDIAN)).toBe(true);
		expect(abandoned.game.pendingRewards).toEqual([]);
	});

	it("remove cartas aposentadas do baralho e mantém itens comuns intactos", () => {
		const state = initial();
		const prior = deckOf(state, "itemDeck");
		const arranged = withDecks(state, {
			...decksOf(state),
			itemDeck: { ...prior, available: [GUARDIAN, "item_rusty_dagger"] },
		});
		const retired = retireAllies(engine, arranged, [GUARDIAN]);
		expect(deckOf(retired, "itemDeck").available).toEqual(["item_rusty_dagger"]);
		expect(isRetiredAlly(retired, GUARDIAN)).toBe(true);
	});
	it("aliado e amuleto compartilham o mesmo slot e a troca aposenta o aliado", () => {
		const recruited = moveInventoryItem(engine, initial(), GUARDIAN, mesa, equip("h1"))!;
		const charmId = "item_low_flame_charm";
		const withCharm = withGame(recruited, (g) => ({ ...g,
			pendingRewards: [{ cardId: charmId, type: "item" as const, requiresBearer: false }],
		}));
		const replaced = moveInventoryItem(engine, withCharm, charmId, mesa, equip("h1"))!;
		expect(heroesOf(replaced)[0]?.activeItems.amulet).toBe(charmId);
		expect(heroesOf(replaced)[0]?.activeItems.ally).toBeUndefined();
		expect(isRetiredAlly(replaced, GUARDIAN)).toBe(true);
		const allyReward = withGame(replaced, (g) => ({ ...g,
			pendingRewards: [{ cardId: SCOUT, type: "item" as const, requiresBearer: false }],
		}));
		const next = moveInventoryItem(engine, allyReward, SCOUT, mesa, equip("h1"))!;
		expect(heroesOf(next)[0]?.activeItems.amulet).toBe(SCOUT);
		expect(next.game.pendingRewards.map((reward) => reward.cardId)).toContain(charmId);
	});

});

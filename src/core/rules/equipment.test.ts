import { describe, expect, it } from "vitest";
import { backpackCapacity } from "../gameEngine";
import { testEngine } from "../__tests__/testEngine";
import { getCardById } from "../data/cards";
import type { ItemCard } from "../data/cardTypes";
import { handleUseItem } from "../reducer/combat";
import { handleInvMove } from "../reducer/reward";
import { handleCheckBossCondition } from "../reducer/exploration";
import { ActivationTracker } from "../state/activation";
import { createInitialGameState, type GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import {
	collectHeroHitBonusesFromItems,
	itemIsExhausted,
	manualItemOptions,
	totalItemValue,
} from "./itemEffects";
import {
	equippedItemAt,
	itemAllowedForHero,
	placeEquipment,
} from "./equipment";
import { deckOf, heroesOf } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { withGame, gameOf } from "../../engine/state";

const HOOD = "item_tunnel_hood";
const BOOTS = "item_light_stone_boots";
const ARMOR = "item_reinforced_leather_armor";
const DAGGER = "item_rusty_dagger";
const SHIELD = "item_cracked_shield";
const BOW = "item_rift_bow";
const CHARM = "item_low_flame_charm";
const POTION = "item_lesser_vigor_potion";

function state(): GameState {
	const base = createInitialGameState({ heroCardIds: [] });
	const hero: HeroState = {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 5,
		damage: 4,
		hitBonus: 0,
		dice: 2,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
	return settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [hero], status: "REWARD_PHASE" })));
}

function onTable(game: GameState, itemId: string): GameState {
	return withGame(game, (prevGame) => ({ ...prevGame, pendingRewards: [
			...gameOf(game).pendingRewards,
			{ type: "item", cardId: itemId, requiresBearer: false },
		] }));
}

function equip(
	game: GameState,
	itemId: string,
	slotType?: "clothing1" | "clothing2" | "hand1" | "hand2" | "amulet",
): GameState {
	return handleInvMove(testEngine,
		onTable(game, itemId),
		itemId,
		{ kind: "mesa" },
		{ kind: "hero_equip", heroId: "h1", slotType },
	);
}

describe("equipamentos declarados nas cartas", () => {
	it("equipa duas vestimentas, rejeita a terceira e permite substituição explícita", () => {
		const first = equip(state(), HOOD);
		const second = equip(first, BOOTS);
		expect(heroesOf(second)[0]?.activeItems).toMatchObject({
			clothing1: HOOD,
			clothing2: BOOTS,
		});
		const thirdOnTable = onTable(second, ARMOR);
		expect(
			handleInvMove(testEngine,
				thirdOnTable,
				ARMOR,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(thirdOnTable);
		const replaced = handleInvMove(testEngine,
			thirdOnTable,
			ARMOR,
			{ kind: "mesa" },
			{ kind: "hero_equip", heroId: "h1", slotType: "clothing1" },
		);
		expect(heroesOf(replaced)[0]?.activeItems).toMatchObject({
			clothing1: ARMOR,
			clothing2: BOOTS,
		});
		expect(gameOf(replaced).pendingRewards.map((reward) => reward.cardId)).toEqual([
			HOOD,
		]);
	});

	it("equipa duas mãos, detecta conflito de duas mãos e libera ambas ao desequipar", () => {
		const twoHands = equip(equip(state(), DAGGER), SHIELD);
		expect(heroesOf(twoHands)[0]?.activeItems).toMatchObject({
			hand1: DAGGER,
			hand2: SHIELD,
		});
		const conflict = onTable(twoHands, BOW);
		expect(
			handleInvMove(testEngine,
				conflict,
				BOW,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(conflict);
		const replaced = handleInvMove(testEngine,
			conflict,
			BOW,
			{ kind: "mesa" },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(heroesOf(replaced)[0]?.activeItems.hand1).toBe(BOW);
		expect(heroesOf(replaced)[0]?.activeItems.hand2).toBeUndefined();
		expect(equippedItemAt(testEngine, heroesOf(replaced)[0]!, "hand2")).toBe(BOW);
		expect(
			gameOf(replaced).pendingRewards.map((reward) => reward.cardId).sort(),
		).toEqual([DAGGER, SHIELD].sort());
		const removed = handleInvMove(testEngine,
			replaced,
			BOW,
			{ kind: "hero_slot", heroId: "h1", slotType: "hand1" },
			{ kind: "hero_backpack", heroId: "h1" },
		);
		expect(equippedItemAt(testEngine, heroesOf(removed)[0]!, "hand1")).toBeUndefined();
		expect(equippedItemAt(testEngine, heroesOf(removed)[0]!, "hand2")).toBeUndefined();
		expect(heroesOf(removed)[0]?.backpack).toEqual([BOW]);
	});

	it("troca da mochila é atômica, inclusive quando dois itens seriam deslocados", () => {
		const full = settled(withGame(equip(equip(state(), DAGGER), SHIELD), (prevGame) => ({ ...prevGame, heroes: [
				{
					...gameOf(state()).heroes[0]!,
					activeItems: { hand1: DAGGER, hand2: SHIELD },
					backpack: [BOW, HOOD, BOOTS],
				},
			] })));
		expect(heroesOf(full)[0]?.backpack).toHaveLength(backpackCapacity(testEngine));
		const refused = handleInvMove(testEngine,
			full,
			BOW,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(refused).toBe(full);
		const oneHand = settled(withGame(full, (prevGame) => ({ ...prevGame, heroes: [
				{
					...heroesOf(full)[0]!,
					activeItems: { hand1: DAGGER },
					backpack: [SHIELD, HOOD, BOOTS],
				},
			] })));
		const swapped = handleInvMove(testEngine,
			oneHand,
			SHIELD,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(heroesOf(swapped)[0]?.activeItems.hand1).toBe(SHIELD);
		expect(heroesOf(swapped)[0]?.backpack).toEqual([DAGGER, HOOD, BOOTS]);
		expect([
			heroesOf(swapped)[0]?.activeItems.hand1,
			...heroesOf(swapped)[0]!.backpack,
		]).toHaveLength(4);
	});

	it("rejeita interação repetida e cópia já equipada", () => {
		const game = equip(state(), DAGGER);
		expect(
			handleInvMove(testEngine,
				game,
				DAGGER,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(game);
		const duplicatedReward = onTable(game, DAGGER);
		expect(
			handleInvMove(testEngine,
				duplicatedReward,
				DAGGER,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(duplicatedReward);
	});

	it("respeita mochila cheia e fase; carta sem slot não equipa pela categoria", () => {
		const full = settled(withGame(state(), (prevGame) => ({ ...prevGame, heroes: [{ ...gameOf(state()).heroes[0]!, backpack: [HOOD, BOOTS, DAGGER] }] })));
		const reward = onTable(full, POTION);
		expect(
			handleInvMove(testEngine,
				reward,
				POTION,
				{ kind: "mesa" },
				{ kind: "hero_backpack", heroId: "h1" },
			),
		).toBe(reward);
		const potion = getCardById(POTION) as ItemCard;
		expect(
			placeEquipment(testEngine, heroesOf(reward)[0]!, {
				...potion,
				equipmentSlot: undefined,
			}),
		).toBeNull();
		const combat = withGame(reward, (prevGame) => ({ ...prevGame, status: "HERO_ACTION" as const }));
		expect(
			handleInvMove(testEngine,
				combat,
				POTION,
				{ kind: "mesa" },
				{ kind: "hero_backpack", heroId: "h1" },
			),
		).toBe(combat);
	});

	it("valida classe por metadados sem lista de IDs no motor", () => {
		const item = getCardById(DAGGER) as ItemCard;
		const restricted = { ...item, allowedHeroIds: ["hero_crimson_rune_mage"] };
		expect(itemAllowedForHero(restricted, gameOf(state()).heroes[0]!)).toBe(false);
		expect(placeEquipment(testEngine, gameOf(state()).heroes[0]!, restricted)).toBeNull();
	});

	it("bônus só existe equipado e não se acumula após troca", () => {
		const backpack = settled(withGame(state(), (prevGame) => ({ ...prevGame, heroes: [{ ...gameOf(state()).heroes[0]!, backpack: [CHARM] }] })));
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(testEngine, heroesOf(backpack)[0]!, backpack),
			),
		).toBe(0);
		const equipped = handleInvMove(testEngine,
			backpack,
			CHARM,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(testEngine, heroesOf(equipped)[0]!, equipped),
			),
		).toBe(2);
		const removed = handleInvMove(testEngine,
			equipped,
			CHARM,
			{ kind: "hero_slot", heroId: "h1", slotType: "amulet" },
			{ kind: "hero_backpack", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(testEngine, heroesOf(removed)[0]!, removed),
			),
		).toBe(0);
		const reequipped = handleInvMove(testEngine,
			removed,
			CHARM,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(testEngine, heroesOf(reequipped)[0]!, reequipped),
			),
		).toBe(2);
	});

	it("consumível equipado usa grant declarativo e é descartado", () => {
		const game = equip(state(), POTION);
		expect(
			manualItemOptions(testEngine, game, "h1").map((option) => option.itemId),
		).toContain(POTION);
		const used = handleUseItem(testEngine, game, POTION, "h1", "h1");
		expect(heroesOf(used)[0]?.currentLife).toBeGreaterThan(5);
		expect(heroesOf(used)[0]?.activeItems.hand1).toBeUndefined();
		expect(deckOf(used, "itemDeck").discarded).toContain(POTION);
	});

	it("READY e EXHAUSTED seguem o lock e recuperam no escopo da sala", () => {
		const game = equip(state(), CHARM);
		const exhausted = ActivationTracker.disable(testEngine, game, {
			kind: "item",
			id: "h1:item_low_flame_charm",
			scope: "room",
		});
		expect(itemIsExhausted(exhausted, "h1", CHARM)).toBe(true);
		expect(heroesOf(exhausted)[0]?.activeItems.amulet).toBe(CHARM);
		const recovered = ActivationTracker.clearScope(exhausted, "room");
		expect(itemIsExhausted(recovered, "h1", CHARM)).toBe(false);
	});

	it("preserva inventário e recupera itens ao sair da sala", () => {
		const game = equip(state(), CHARM);
		const exhausted = ActivationTracker.disable(
			testEngine,
			withGame(game, (prevGame) => ({ ...prevGame, currentRoom: {
					cardId: "room_abandoned_cell",
					exits: 1,
					currentEnemies: 0,
					reward: 0,
					rewardType: "item",
					effect: "",
					xp: 0,
					status: "cleared",
				} })),
			{ kind: "item", id: "h1:item_low_flame_charm", scope: "room" },
		);
		const next = handleCheckBossCondition(testEngine, exhausted);
		expect(heroesOf(next)[0]?.activeItems.amulet).toBe(CHARM);
		expect(heroesOf(next)[0]?.backpack).toEqual([]);
		expect(itemIsExhausted(next, "h1", CHARM)).toBe(false);
	});
});

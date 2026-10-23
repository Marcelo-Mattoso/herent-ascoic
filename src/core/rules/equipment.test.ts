import { describe, expect, it } from "vitest";
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
	BACKPACK_CAPACITY,
	equippedItemAt,
	itemAllowedForHero,
	placeEquipment,
} from "./equipment";

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
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
	return { ...base, heroes: [hero], status: "REWARD_PHASE" };
}

function onTable(game: GameState, itemId: string): GameState {
	return {
		...game,
		pendingRewards: [
			...game.pendingRewards,
			{ type: "item", cardId: itemId, requiresBearer: false },
		],
	};
}

function equip(
	game: GameState,
	itemId: string,
	slotType?: "clothing1" | "clothing2" | "hand1" | "hand2" | "amulet",
): GameState {
	return handleInvMove(
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
		expect(second.heroes[0]?.activeItems).toMatchObject({
			clothing1: HOOD,
			clothing2: BOOTS,
		});
		const thirdOnTable = onTable(second, ARMOR);
		expect(
			handleInvMove(
				thirdOnTable,
				ARMOR,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(thirdOnTable);
		const replaced = handleInvMove(
			thirdOnTable,
			ARMOR,
			{ kind: "mesa" },
			{ kind: "hero_equip", heroId: "h1", slotType: "clothing1" },
		);
		expect(replaced.heroes[0]?.activeItems).toMatchObject({
			clothing1: ARMOR,
			clothing2: BOOTS,
		});
		expect(replaced.pendingRewards.map((reward) => reward.cardId)).toEqual([
			HOOD,
		]);
	});

	it("equipa duas mãos, detecta conflito de duas mãos e libera ambas ao desequipar", () => {
		const twoHands = equip(equip(state(), DAGGER), SHIELD);
		expect(twoHands.heroes[0]?.activeItems).toMatchObject({
			hand1: DAGGER,
			hand2: SHIELD,
		});
		const conflict = onTable(twoHands, BOW);
		expect(
			handleInvMove(
				conflict,
				BOW,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(conflict);
		const replaced = handleInvMove(
			conflict,
			BOW,
			{ kind: "mesa" },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(replaced.heroes[0]?.activeItems.hand1).toBe(BOW);
		expect(replaced.heroes[0]?.activeItems.hand2).toBeUndefined();
		expect(equippedItemAt(replaced.heroes[0]!, "hand2")).toBe(BOW);
		expect(
			replaced.pendingRewards.map((reward) => reward.cardId).sort(),
		).toEqual([DAGGER, SHIELD].sort());
		const removed = handleInvMove(
			replaced,
			BOW,
			{ kind: "hero_slot", heroId: "h1", slotType: "hand1" },
			{ kind: "hero_backpack", heroId: "h1" },
		);
		expect(equippedItemAt(removed.heroes[0]!, "hand1")).toBeUndefined();
		expect(equippedItemAt(removed.heroes[0]!, "hand2")).toBeUndefined();
		expect(removed.heroes[0]?.backpack).toEqual([BOW]);
	});

	it("troca da mochila é atômica, inclusive quando dois itens seriam deslocados", () => {
		const full = {
			...equip(equip(state(), DAGGER), SHIELD),
			heroes: [
				{
					...state().heroes[0]!,
					activeItems: { hand1: DAGGER, hand2: SHIELD },
					backpack: [BOW, HOOD, BOOTS],
				},
			],
		};
		expect(full.heroes[0]?.backpack).toHaveLength(BACKPACK_CAPACITY);
		const refused = handleInvMove(
			full,
			BOW,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(refused).toBe(full);
		const oneHand = {
			...full,
			heroes: [
				{
					...full.heroes[0]!,
					activeItems: { hand1: DAGGER },
					backpack: [SHIELD, HOOD, BOOTS],
				},
			],
		};
		const swapped = handleInvMove(
			oneHand,
			SHIELD,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1", slotType: "hand1" },
		);
		expect(swapped.heroes[0]?.activeItems.hand1).toBe(SHIELD);
		expect(swapped.heroes[0]?.backpack).toEqual([DAGGER, HOOD, BOOTS]);
		expect([
			swapped.heroes[0]?.activeItems.hand1,
			...swapped.heroes[0]!.backpack,
		]).toHaveLength(4);
	});

	it("rejeita interação repetida e cópia já equipada", () => {
		const game = equip(state(), DAGGER);
		expect(
			handleInvMove(
				game,
				DAGGER,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(game);
		const duplicatedReward = onTable(game, DAGGER);
		expect(
			handleInvMove(
				duplicatedReward,
				DAGGER,
				{ kind: "mesa" },
				{ kind: "hero_equip", heroId: "h1" },
			),
		).toBe(duplicatedReward);
	});

	it("respeita mochila cheia e fase; carta sem slot não equipa pela categoria", () => {
		const full = {
			...state(),
			heroes: [{ ...state().heroes[0]!, backpack: [HOOD, BOOTS, DAGGER] }],
		};
		const reward = onTable(full, POTION);
		expect(
			handleInvMove(
				reward,
				POTION,
				{ kind: "mesa" },
				{ kind: "hero_backpack", heroId: "h1" },
			),
		).toBe(reward);
		const potion = getCardById(POTION) as ItemCard;
		expect(
			placeEquipment(reward.heroes[0]!, {
				...potion,
				equipmentSlot: undefined,
			}),
		).toBeNull();
		const combat = { ...reward, status: "HERO_ACTION" as const };
		expect(
			handleInvMove(
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
		expect(itemAllowedForHero(restricted, state().heroes[0]!)).toBe(false);
		expect(placeEquipment(state().heroes[0]!, restricted)).toBeNull();
	});

	it("bônus só existe equipado e não se acumula após troca", () => {
		const backpack = {
			...state(),
			heroes: [{ ...state().heroes[0]!, backpack: [CHARM] }],
		};
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(backpack.heroes[0]!, backpack),
			),
		).toBe(0);
		const equipped = handleInvMove(
			backpack,
			CHARM,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(equipped.heroes[0]!, equipped),
			),
		).toBe(2);
		const removed = handleInvMove(
			equipped,
			CHARM,
			{ kind: "hero_slot", heroId: "h1", slotType: "amulet" },
			{ kind: "hero_backpack", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(removed.heroes[0]!, removed),
			),
		).toBe(0);
		const reequipped = handleInvMove(
			removed,
			CHARM,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(
			totalItemValue(
				collectHeroHitBonusesFromItems(reequipped.heroes[0]!, reequipped),
			),
		).toBe(2);
	});

	it("consumível equipado usa grant declarativo e é descartado", () => {
		const game = equip(state(), POTION);
		expect(
			manualItemOptions(game, "h1").map((option) => option.itemId),
		).toContain(POTION);
		const used = handleUseItem(game, POTION, "h1", "h1");
		expect(used.heroes[0]?.currentLife).toBeGreaterThan(5);
		expect(used.heroes[0]?.activeItems.hand1).toBeUndefined();
		expect(used.decks.itemDeck.discarded).toContain(POTION);
	});

	it("READY e EXHAUSTED seguem o lock e recuperam no escopo da sala", () => {
		const game = equip(state(), CHARM);
		const exhausted = ActivationTracker.disable(game, {
			kind: "item",
			id: "h1:item_low_flame_charm",
			scope: "room",
		});
		expect(itemIsExhausted(exhausted, "h1", CHARM)).toBe(true);
		expect(exhausted.heroes[0]?.activeItems.amulet).toBe(CHARM);
		const recovered = ActivationTracker.clearScope(exhausted, "room");
		expect(itemIsExhausted(recovered, "h1", CHARM)).toBe(false);
	});

	it("preserva inventário e recupera itens ao sair da sala", () => {
		const game = equip(state(), CHARM);
		const exhausted = ActivationTracker.disable(
			{
				...game,
				currentRoom: {
					cardId: "room_abandoned_cell",
					exits: 1,
					currentEnemies: 0,
					reward: 0,
					rewardType: "item",
					effect: "",
					xp: 0,
					status: "cleared",
				},
			},
			{ kind: "item", id: "h1:item_low_flame_charm", scope: "room" },
		);
		const next = handleCheckBossCondition(exhausted);
		expect(next.heroes[0]?.activeItems.amulet).toBe(CHARM);
		expect(next.heroes[0]?.backpack).toEqual([]);
		expect(itemIsExhausted(next, "h1", CHARM)).toBe(false);
	});
});

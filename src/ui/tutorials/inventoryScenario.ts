import { reducer } from "@/core/reducer";
import type { Action } from "@/core/actions/types";
import { moveInventoryItem } from "@/core/rules/inventoryMoves";
import { itemIsExhausted } from "@/core/rules/itemEffects";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { COMBAT_DEFAULT_HERO, COMBAT_FINISHING_SEED } from "./combatScenario";

export const INVENTORY_ITEMS = {
	dagger: "item_rusty_dagger",
	axe: "item_ruined_hall_axe",
	armor: "item_reinforced_leather_armor",
	precision: "item_precision_potion",
	vigor: "item_lesser_vigor_potion",
	charm: "item_warm_blood_charm",
} as const;

/** A cleared seeded encounter, followed by real inventory moves. The remaining
 * reward keeps the ordinary reward screen from drawing a new random reward. */
export function prepareInventoryTraining(
	heroCardId = COMBAT_DEFAULT_HERO,
): GameState {
	let state = createInitialGameState({ heroCardIds: [] });
	for (const action of [
		{
			type: "START_GAME",
			payload: {
				heroCardIds: [heroCardId],
				difficulty: "normal",
				mode: "cooperative",
				seed: COMBAT_FINISHING_SEED,
			},
		},
		{ type: "RESOLVE_ROOM_EFFECT" },
		{ type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
	] satisfies Action[])
		state = reducer(state, action);
	const hero = state.heroes[0];
	const enemy = state.activeEnemies[0];
	if (!hero || !enemy || state.status !== "HERO_ACTION")
		throw new Error("Encontro de treinamento indisponível");
	for (const action of [
		{ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: hero.id } },
		{ type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId: enemy.id } },
		{ type: "ROLL_DICE" },
		{ type: "RESOLVE_ATTACK" },
		{ type: "CHECK_COMBAT_END" },
	] satisfies Action[])
		state = reducer(state, action);
	if (state.status !== "REWARD_PHASE")
		throw new Error("A recompensa de treinamento não foi alcançada");
	const ids = [
		INVENTORY_ITEMS.dagger,
		INVENTORY_ITEMS.axe,
		INVENTORY_ITEMS.armor,
		INVENTORY_ITEMS.precision,
		INVENTORY_ITEMS.vigor,
	];
	state = {
		...state,
		pendingRewards: ids.map((cardId) => ({
			type: "item",
			cardId,
			requiresBearer: false,
		})),
		decks: {
			...state.decks,
			itemDeck: {
				...state.decks.itemDeck,
				available: state.decks.itemDeck.available.filter(
					(id) => !ids.includes(id as (typeof ids)[number]),
				),
			},
		},
	};
	for (const cardId of [
		INVENTORY_ITEMS.dagger,
		INVENTORY_ITEMS.axe,
		INVENTORY_ITEMS.armor,
	]) {
		const moved = moveInventoryItem(
			state,
			cardId,
			{ kind: "mesa" },
			{ kind: "hero_backpack", heroId: hero.id },
		);
		if (!moved) throw new Error(`Não foi possível guardar ${cardId}`);
		state = moved;
	}
	const equipped = moveInventoryItem(
		state,
		INVENTORY_ITEMS.precision,
		{ kind: "mesa" },
		{ kind: "hero_equip", heroId: hero.id, slotType: "hand1" },
	);
	if (!equipped) throw new Error("Não foi possível preparar a poção");
	return equipped;
}

/** A second legitimate situation: an equipped charm reacts to damage and
 * remains exhausted in the next combat round while the hero can attack. */
export function prepareExhaustedInventoryTraining(
	heroCardId = COMBAT_DEFAULT_HERO,
): GameState {
	let state = prepareInventoryTraining(heroCardId);
	const hero = state.heroes[0];
	const charmId = INVENTORY_ITEMS.charm;
	const unequippedPotion = moveInventoryItem(
		state,
		INVENTORY_ITEMS.precision,
		{ kind: "hero_slot", heroId: hero.id, slotType: "hand1" },
		{ kind: "mesa" },
	);
	if (!unequippedPotion)
		throw new Error("Não foi possível liberar a mão do encanto");
	state = unequippedPotion;
	state = {
		...state,
		pendingRewards: [
			...state.pendingRewards,
			{ type: "item", cardId: charmId, requiresBearer: false },
		],
		decks: {
			...state.decks,
			itemDeck: {
				...state.decks.itemDeck,
				available: state.decks.itemDeck.available.filter(
					(id) => id !== charmId,
				),
			},
		},
	};
	const equipped = moveInventoryItem(
		state,
		charmId,
		{ kind: "mesa" },
		{ kind: "hero_equip", heroId: hero.id, slotType: "amulet" },
	);
	if (!equipped) throw new Error("Não foi possível preparar o encanto");
	state = equipped;
	const armorIndex = state.heroes[0].backpack.indexOf(INVENTORY_ITEMS.armor);
	const armored = moveInventoryItem(
		state,
		INVENTORY_ITEMS.armor,
		{ kind: "hero_backpack", heroId: hero.id, index: armorIndex },
		{ kind: "hero_equip", heroId: hero.id, slotType: "clothing1" },
	);
	if (!armored) throw new Error("Não foi possível equipar a vestimenta");
	state = armored;
	for (const action of [
		{ type: "INV_DISCARD_MESA" },
		{ type: "OPEN_PATHS" },
		{ type: "RESOLVE_ROOM_EFFECT" },
		{ type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
		{ type: "USE_ITEM", payload: { heroId: hero.id, itemId: charmId } },
		{ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: hero.id } },
		{ type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId: "" } },
		{ type: "ROLL_DICE" },
		{ type: "RESOLVE_ATTACK" },
		{ type: "DIRECT_DAMAGE" },
		{ type: "CHECK_COMBAT_END" },
	] satisfies Action[]) {
		const resolved =
			action.type === "CHOOSE_TARGET"
				? {
						...action,
						payload: {
							heroId: hero.id,
							enemyId: state.activeEnemies[0]?.id ?? "",
						},
					}
				: action;
		state = reducer(state, resolved);
	}
	if (
		state.status !== "HERO_ACTION" ||
		!itemIsExhausted(state, hero.id, charmId) ||
		state.combat?.heroesActed.length
	)
		throw new Error("O encanto não ficou exaurido em uma rodada ativa");
	return state;
}

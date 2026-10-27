import type { Action } from "@/core/actions/types";
import { reducer } from "@/core/reducer";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { moveInventoryItem } from "@/core/rules/inventoryMoves";
import { COMBAT_OPENING_SEED } from "./combatScenario";
import { INVENTORY_ITEMS, prepareInventoryTraining } from "./inventoryScenario";

export const ABILITY_HUNTER = "hero_broken_veil_hunter";
export const ABILITY_BARBARIAN = "hero_crimson_barbarian";
export const ABILITY_WARRIOR = "hero_broken_bastion_warrior";
export const PREY_MARK = "skill_prey_mark";
export const CRIMSON_FURY = "skill_crimson_fury";
export const BASTION_POWER = "power_unbreakable_bastion_guard";

/** Replays the ordinary encounter setup through the reducer. No ability is
 * pre-applied; the learner must activate each one through the game UI. */
export function prepareAbilityEncounter(heroCardId: string, seed = heroCardId === ABILITY_HUNTER ? 26 : COMBAT_OPENING_SEED): GameState {
	let state = createInitialGameState({ heroCardIds: [] });
	for (const action of [
		{ type: "START_GAME", payload: { heroCardIds: [heroCardId], difficulty: "normal", mode: "cooperative", seed } },
		{ type: "RESOLVE_ROOM_EFFECT" },
		{ type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
	] satisfies Action[])
		state = reducer(state, action);
	if (state.status !== "HERO_ACTION" || !state.heroes[0] || !state.activeEnemies.some((enemy) => enemy.status === "active"))
		throw new Error(`Encontro de habilidades indisponível para ${heroCardId}`);
	return state;
}

/** A reward is equipped through the inventory rules before entering the next
 * real room. The continuous charm is a projected passive with a named source. */
export function preparePowerAndPassiveEncounter(): GameState {
	let state = prepareInventoryTraining(ABILITY_WARRIOR);
	const heroId = state.heroes[0].id;
	const armorIndex = state.heroes[0].backpack.indexOf(INVENTORY_ITEMS.armor);
	const armored = moveInventoryItem(state, INVENTORY_ITEMS.armor,
		{ kind: "hero_backpack", heroId, index: armorIndex },
		{ kind: "hero_equip", heroId, slotType: "clothing1" });
	if (!armored) throw new Error("Armadura indisponível");
	state = armored;
	const charmId = "item_low_flame_charm";
	state = { ...state,
		pendingRewards: [...state.pendingRewards, { type: "item", cardId: charmId, requiresBearer: false }],
		decks: { ...state.decks, itemDeck: { ...state.decks.itemDeck,
			available: state.decks.itemDeck.available.filter((id) => id !== charmId) } },
	};
	const charmed = moveInventoryItem(state, charmId, { kind: "mesa" },
		{ kind: "hero_equip", heroId, slotType: "amulet" });
	if (!charmed) throw new Error("Amuleto passivo indisponível");
	state = charmed;
	const clearedHand = moveInventoryItem(state, INVENTORY_ITEMS.precision,
		{ kind: "hero_slot", heroId, slotType: "hand1" }, { kind: "mesa" });
	if (!clearedHand) throw new Error("Não foi possível liberar a mão do Guerreiro");
	state = clearedHand;
	for (const action of [
		{ type: "INV_DISCARD_MESA" }, { type: "OPEN_PATHS" },
		{ type: "RESOLVE_ROOM_EFFECT" }, { type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
	] satisfies Action[]) state = reducer(state, action);
	if (state.status !== "HERO_ACTION" || !state.heroes[0]?.activeItems.amulet)
		throw new Error("Poder ou passivo indisponível no checkpoint");
	return state;
}

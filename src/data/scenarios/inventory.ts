import { reducer } from "@/core/reducer";
import type { Action } from "@/core/actions/types";
import { moveInventoryItem } from "@/core/rules/inventoryMoves";
import { itemActivationId, itemIsExhausted } from "@/core/rules/itemEffects";
import { ActivationTracker } from "@/core/state/activation";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { COMBAT_DEFAULT_HERO, COMBAT_FINISHING_SEED } from "./seeds";
import type { GameEngine } from "@/core/gameEngine";

import { deckOf, decksOf, withDecks, withUnitStats, pendingTriggerInterruptOf } from "@/core/state/access";
import { gameOf, withGame } from "../../engine/state";
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
export function prepareInventoryTraining(engine: GameEngine,
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
		state = reducer(engine, state, action);
	const hero = gameOf(state).heroes[0];
	const enemy = gameOf(state).activeEnemies[0];
	if (!hero || !enemy || gameOf(state).status !== "HERO_ACTION")
		throw new Error("Encontro de treinamento indisponível");
	// This checkpoint teaches inventory, not combat balance. Guarantee the
	// seeded finishing blow without relying on individual hero damage tables.
	state = withUnitStats(
		withUnitStats(state, enemy.id, { currentLife: 1, maxLife: 1 }),
		hero.id, { hitBonus: 100 },
	);
	for (const action of [
		{ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: hero.id } },
		{ type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId: enemy.id } },
		{ type: "ROLL_DICE" },
	] satisfies Action[])
		state = reducer(engine, state, action);
	// New reactive powers may interrupt rolls. The inventory checkpoint skips
	// optional combat reactions; ordinary gameplay still asks the player.
	for (let i = 0; i < 12 && pendingTriggerInterruptOf(state); i++) {
		const interrupt = pendingTriggerInterruptOf(state)!;
		state = reducer(engine, state, {
			type: "SKIP_TRIGGER_INTERRUPT", payload: { interruptId: interrupt.id },
		});
	}
	if (pendingTriggerInterruptOf(state))
		throw new Error("Interrupção de treinamento não resolvida");
	for (const action of [
		{ type: "RESOLVE_ATTACK" },
		{ type: "CHECK_COMBAT_END" },
	] satisfies Action[])
		state = reducer(engine, state, action);
	if (gameOf(state).status !== "REWARD_PHASE")
		throw new Error("A recompensa de treinamento não foi alcançada");
	const ids = [
		INVENTORY_ITEMS.dagger,
		INVENTORY_ITEMS.axe,
		INVENTORY_ITEMS.armor,
		INVENTORY_ITEMS.precision,
		INVENTORY_ITEMS.vigor,
	];
	state = withDecks(withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: ids.map((cardId) => ({
			type: "item",
			cardId,
			requiresBearer: false,
		})) })), {
			...decksOf(state),
			itemDeck: {
				...deckOf(state, "itemDeck"),
				available: deckOf(state, "itemDeck").available.filter(
					(id) => !ids.includes(id as (typeof ids)[number]),
				),
			},
		});
	for (const cardId of [
		INVENTORY_ITEMS.dagger,
		INVENTORY_ITEMS.axe,
		INVENTORY_ITEMS.armor,
	]) {
		const moved = moveInventoryItem(engine,
			state,
			cardId,
			{ kind: "mesa" },
			{ kind: "hero_backpack", heroId: hero.id },
		);
		if (!moved) throw new Error(`Não foi possível guardar ${cardId}`);
		state = moved;
	}
	const equipped = moveInventoryItem(engine,
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
export function prepareExhaustedInventoryTraining(engine: GameEngine,
	heroCardId = COMBAT_DEFAULT_HERO,
): GameState {
	let state = prepareInventoryTraining(engine, heroCardId);
	const hero = gameOf(state).heroes[0];
	const charmId = INVENTORY_ITEMS.charm;
	const unequippedPotion = moveInventoryItem(engine,
		state,
		INVENTORY_ITEMS.precision,
		{ kind: "hero_slot", heroId: hero.id, slotType: "hand1" },
		{ kind: "mesa" },
	);
	if (!unequippedPotion)
		throw new Error("Não foi possível liberar a mão do encanto");
	state = unequippedPotion;
	state = withDecks(withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: [
			...gameOf(state).pendingRewards,
			{ type: "item", cardId: charmId, requiresBearer: false },
		] })), {
			...decksOf(state),
			itemDeck: {
				...deckOf(state, "itemDeck"),
				available: deckOf(state, "itemDeck").available.filter(
					(id) => id !== charmId,
				),
			},
		});
	const equipped = moveInventoryItem(engine,
		state,
		charmId,
		{ kind: "mesa" },
		{ kind: "hero_equip", heroId: hero.id, slotType: "amulet" },
	);
	if (!equipped) throw new Error("Não foi possível preparar o encanto");
	state = equipped;
	const armorIndex = gameOf(state).heroes[0].backpack.indexOf(INVENTORY_ITEMS.armor);
	const armored = moveInventoryItem(engine,
		state,
		INVENTORY_ITEMS.armor,
		{ kind: "hero_backpack", heroId: hero.id, index: armorIndex },
		{ kind: "hero_equip", heroId: hero.id, slotType: "clothing1" },
	);
	if (!armored) throw new Error("Não foi possível equipar a vestimenta");
	state = armored;
	// Enter the next combat with the equipment gained through inventory moves.
	for (const action of [
		{ type: "INV_DISCARD_MESA" },
		{ type: "OPEN_PATHS" },
		{ type: "RESOLVE_ROOM_EFFECT" },
		{ type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
	] satisfies Action[]) state = reducer(engine, state, action);
	if (gameOf(state).status !== "HERO_ACTION" || !gameOf(state).combat)
		throw new Error("Nova sala de treinamento indisponível");
	// This checkpoint demonstrates a charm already spent in the current
	// combat. Mark only the item's combat lock; do not fabricate a damage
	// exchange or consume the hero's action just to set up the tutorial.
	state = ActivationTracker.disable(engine, state, {
		kind: "item", id: itemActivationId(hero.id, charmId),
		scope: "combat", sourceId: hero.id,
		reason: "checkpoint: reação defensiva já utilizada",
	});
	if (
		gameOf(state).status !== "HERO_ACTION" ||
		!itemIsExhausted(state, hero.id, charmId) ||
		gameOf(state).combat?.heroesActed.length
	)
		throw new Error("O encanto não ficou exaurido em uma rodada ativa");
	return state;
}

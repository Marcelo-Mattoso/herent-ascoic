import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer";
import { createGameJournal } from "@/core/journal/gameJournal";
import { equippedItemAt } from "@/core/rules/equipment";
import {
	INVENTORY_ITEMS,
	prepareExhaustedInventoryTraining,
	prepareInventoryTraining,
} from "./inventoryScenario";
import {
	itemIsExhausted,
	manualItemUnavailableReason,
} from "@/core/rules/itemEffects";
import { selectHeroCombatActions } from "@/ui/store/selectors";
import {
	continueTutorial,
	currentTutorialStep,
	observeInventoryUi,
	reconcileTutorial,
	startTutorial,
} from "./session";
import { playerView } from "@/core/projection/playerView";
import type { Action } from "@/core/actions/types";

describe("Arquivo III", () => {
	it("preserva qualquer um dos oito heróis nos dois checkpoints", () => {
		for (const cardId of [
			"hero_eternal_rest_cleric",
			"hero_broken_bastion_warrior",
			"hero_rift_rogue",
			"hero_crimson_rune_mage",
			"hero_crimson_barbarian",
			"hero_last_light_paladin",
			"hero_deep_veil_necromancer",
			"hero_broken_veil_hunter",
		]) {
			expect(prepareInventoryTraining(cardId).heroes[0].cardId).toBe(cardId);
			expect(prepareExhaustedInventoryTraining(cardId).heroes[0].cardId).toBe(
				cardId,
			);
		}
	});

	it("prepara uma recompensa válida, sem duplicar cartas ou exceder a mochila", () => {
		const state = prepareInventoryTraining();
		const hero = state.heroes[0];
		expect(state.status).toBe("REWARD_PHASE");
		expect(hero.backpack).toEqual([
			INVENTORY_ITEMS.dagger,
			INVENTORY_ITEMS.axe,
			INVENTORY_ITEMS.armor,
		]);
		expect(hero.activeItems.hand1).toBe(INVENTORY_ITEMS.precision);
		expect(state.pendingRewards.map((reward) => reward.cardId)).toEqual([
			INVENTORY_ITEMS.vigor,
		]);
		expect(
			new Set([
				...hero.backpack,
				...Object.values(hero.activeItems),
				...state.pendingRewards.map((reward) => reward.cardId),
			]).size,
		).toBe(5);
		expect(createGameJournal(state).get().current.issues).toEqual([]);
	});

	it("prepara um encanto exaurido em combate com o herói livre para atacar", () => {
		const state = prepareExhaustedInventoryTraining();
		const hero = state.heroes[0];
		expect(hero.activeItems.amulet).toBe(INVENTORY_ITEMS.charm);
		expect(itemIsExhausted(state, hero.id, INVENTORY_ITEMS.charm)).toBe(true);
		expect(state.combat?.heroesActed).toEqual([]);
		expect(state.status).toBe("HERO_ACTION");
		expect(selectHeroCombatActions(state, hero.id).canStartAttack).toBe(true);
		expect(
			manualItemUnavailableReason(state, hero.id, INVENTORY_ITEMS.charm),
		).toBeTruthy();
		expect(
			createGameJournal(state)
				.get()
				.current.heroes[0].equipment.find((slot) => slot.slot === "amulet")
				?.card?.state,
		).toBe("exhausted");
		expect(createGameJournal(state).get().current.issues).toEqual([]);
		let next = state;
		const enemyId = next.activeEnemies[0].id;
		for (const action of [
			{ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: hero.id } },
			{ type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId } },
			{ type: "ROLL_DICE" },
			{ type: "RESOLVE_ATTACK" },
			{ type: "CHECK_COMBAT_END" },
		] satisfies Action[])
			next = reducer(next, action);
		expect(next.status).toBe("REWARD_PHASE");
		expect(itemIsExhausted(next, hero.id, INVENTORY_ITEMS.charm)).toBe(false);
	});

	it("observa apenas movimentos válidos e o uso com efeito confirmado", () => {
		let state = prepareInventoryTraining();
		let journal = createGameJournal(state);
		const heroId = state.heroes[0].id;
		const apply = (action: Action) => {
			const before = state;
			state = reducer(state, action);
			journal.record(action, before, state);
		};
		let session = startTutorial("archive-three");
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("inventory-open");
		expect(observeInventoryUi(session, false, null, playerView(state))).toBe(
			session,
		);
		session = observeInventoryUi(session, true, null, playerView(state));
		expect(currentTutorialStep(session).id).toBe("inventory-slots");
		for (let i = 0; i < 4; i++) session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("item-inspect");
		session = observeInventoryUi(
			session,
			true,
			INVENTORY_ITEMS.dagger,
			playerView(state),
		);
		expect(currentTutorialStep(session).id).toBe("item-inspect");
		session = observeInventoryUi(session, true, null, playerView(state));
		expect(currentTutorialStep(session).id).toBe("equip-dagger");
		apply({
			type: "INV_MOVE",
			payload: {
				itemId: INVENTORY_ITEMS.dagger,
				from: { kind: "hero_backpack", heroId, index: 0 },
				to: { kind: "hero_equip", heroId },
			},
		});
		session = reconcileTutorial(session, playerView(state), journal.get());
		expect(currentTutorialStep(session).id).toBe("equip-axe");
		const unchanged = state;
		apply({
			type: "INV_MOVE",
			payload: {
				itemId: INVENTORY_ITEMS.axe,
				from: { kind: "hero_backpack", heroId, index: 0 },
				to: { kind: "hero_equip", heroId, slotType: "clothing1" },
			},
		});
		expect(state).toBe(unchanged);
		expect(reconcileTutorial(session, playerView(state), journal.get())).toBe(
			session,
		);
		apply({
			type: "INV_MOVE",
			payload: {
				itemId: INVENTORY_ITEMS.axe,
				from: { kind: "hero_backpack", heroId, index: 0 },
				to: { kind: "hero_equip", heroId, slotType: "hand1" },
			},
		});
		session = reconcileTutorial(session, playerView(state), journal.get());
		expect(currentTutorialStep(session).id).toBe("equip-armor");
		expect(equippedItemAt(state.heroes[0], "hand2")).toBe(INVENTORY_ITEMS.axe);
		expect(state.heroes[0].backpack).toContain(INVENTORY_ITEMS.dagger);
		expect(state.heroes[0].backpack.length).toBe(3);
		const armorIndex = state.heroes[0].backpack.indexOf(INVENTORY_ITEMS.armor);
		apply({
			type: "INV_MOVE",
			payload: {
				itemId: INVENTORY_ITEMS.armor,
				from: { kind: "hero_backpack", heroId, index: armorIndex },
				to: { kind: "hero_equip", heroId },
			},
		});
		session = reconcileTutorial(session, playerView(state), journal.get());
		expect(currentTutorialStep(session).id).toBe("use-item");
		const potionIndex = state.heroes[0].backpack.indexOf(
			INVENTORY_ITEMS.precision,
		);
		apply({
			type: "INV_MOVE",
			payload: {
				itemId: INVENTORY_ITEMS.precision,
				from: { kind: "hero_backpack", heroId, index: potionIndex },
				to: { kind: "hero_equip", heroId, slotType: "hand1" },
			},
		});
		expect(reconcileTutorial(session, playerView(state), journal.get())).toBe(
			session,
		);
		apply({
			type: "USE_ITEM",
			payload: { heroId, itemId: INVENTORY_ITEMS.precision },
		});
		session = reconcileTutorial(session, playerView(state), journal.get());
		expect(currentTutorialStep(session).id).toBe("item-states");
		expect(state.decks.itemDeck.discarded).toContain(INVENTORY_ITEMS.precision);
		expect(
			journal
				.get()
				.current.heroes[0].modifiers.some(
					(modifier) => modifier.sourceId === "ability_hit_bonus_once",
				),
		).toBe(true);
		expect(state.combat?.heroesActed).toEqual([]);
		expect(journal.get().current.issues).toEqual([]);
	});
});

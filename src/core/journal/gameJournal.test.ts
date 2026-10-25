import { describe, expect, it } from "vitest";
import { cardAbilityGrants } from "../data/abilities";
import { addComponent, createEntity, upsertEntity } from "../ecs/world";
import { reducer } from "../reducer";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import { createEmptyCombatState } from "../state/combatState";
import { applyDamage } from "../systems/damageSystem";
import {
	createGameJournal,
	exportJournalJson,
	exportJournalText,
	projectJournalState,
} from "./gameJournal";

const HERO = "hero_crimson_barbarian";
const BOW = "item_rift_bow";
const CHARM = "item_silent_dungeon_charm";

function started(): GameState {
	return reducer(createInitialGameState({ heroCardIds: [HERO] }), {
		type: "START_GAME",
		payload: { heroCardIds: [HERO], seed: 17, gameId: "journal-test" },
	});
}

describe("diário da partida", () => {
	it("correlaciona abertura e recusa de trigger com a continuação real", () => {
		const base = started();
		const before: GameState = {
			...base,
			status: "HERO_ACTION",
			combat: createEmptyCombatState(),
			activeEnemies: [
				{
					id: "e1",
					cardId: "creature_dark_cave_goblin",
					maxLife: 5,
					currentLife: 5,
					damage: 2,
					hitBonus: 0,
					dice: 1,
					tokens: {},
					conditions: [],
					firstDamageTakenThisTurn: false,
					status: "active",
				},
			],
		};
		const journal = createGameJournal(before);
		const pending = applyDamage(before, "e1", 1, {
			sourceId: before.heroes[0]!.id,
		});
		const openingAction = { type: "DIRECT_DAMAGE" as const };
		journal.record(openingAction, before, pending);
		const skipAction = {
			type: "SKIP_TRIGGER_INTERRUPT" as const,
			payload: { interruptId: pending.pendingTriggerInterrupt!.id },
		};
		const resumed = reducer(pending, skipAction);
		journal.record(skipAction, pending, resumed);
		const [opened, skipped] = journal.get().entries;
		expect(opened?.interrupt).toMatchObject({
			decision: "opened",
			event: "evt_damage_dealt",
			continuation: "continue_damage",
		});
		expect(skipped?.interrupt).toMatchObject({
			id: opened?.interrupt?.id,
			decision: "skipped",
			continuation: "continue_damage",
		});
		expect(exportJournalText(journal.get())).toContain(
			`Trigger ${opened?.interrupt?.id}`,
		);
	});
	it("projeta equipamento de duas mãos uma vez, mochila e exaustão do motor", () => {
		const state = started();
		const hero = state.heroes[0];
		const equipped: GameState = {
			...state,
			heroes: [
				{
					...hero,
					activeItems: { hand1: BOW, amulet: CHARM },
					backpack: ["item_lesser_vigor_potion"],
				},
			],
			disabled: {
				[`item:${hero.id}:${CHARM}`]: {
					kind: "item",
					id: `${hero.id}:${CHARM}`,
					scope: "room",
				},
			},
		};
		const projection = projectJournalState(equipped);
		const slots = projection.heroes[0].equipment;
		expect(slots.find((slot) => slot.slot === "hand1")?.card?.id).toBe(BOW);
		expect(slots.find((slot) => slot.slot === "hand2")).toMatchObject({
			card: null,
			sharedWith: "hand1",
		});
		expect(slots.filter((slot) => slot.card?.id === BOW)).toHaveLength(1);
		expect(slots.find((slot) => slot.slot === "amulet")?.card?.state).toBe(
			"exhausted",
		);
		expect(projection.heroes[0].backpack).toHaveLength(3);
		expect(projection.heroes[0].backpack[0]?.id).toBe(
			"item_lesser_vigor_potion",
		);
	});

	it("preserva antes e depois, ordem e limite de memória sem contaminar o GameState", () => {
		const initial = createInitialGameState({ heroCardIds: [HERO] });
		const journal = createGameJournal(initial, 2);
		const startAction = {
			type: "START_GAME" as const,
			payload: { heroCardIds: [HERO], seed: 17, gameId: "journal-test" },
		};
		const first = reducer(initial, startAction);
		journal.record(startAction, initial, first);
		const secondAction = { type: "GAIN_XP" as const, payload: { amount: 2 } };
		const second = reducer(first, secondAction);
		journal.record(secondAction, first, second);
		const third = reducer(second, secondAction);
		journal.record(secondAction, second, third);
		const result = journal.get();
		expect(result.entries).toHaveLength(2);
		expect(result.omittedEntries).toBe(1);
		expect(result.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
		expect(result.entries[0].before.groupXp).toBe(first.groupXp);
		expect(result.entries[0].after.groupXp).toBe(second.groupXp);
		expect(result.current.groupXp).toBe(third.groupXp);
		expect(first.groupXp).toBe(0);
	});

	it("exporta apenas projeções públicas: não inclui ordem de compra, seed ou RNG", () => {
		const state = started();
		const secret: GameState = {
			...state,
			decks: {
				...state.decks,
				dungeonDeck: {
					...state.decks.dungeonDeck,
					available: ["CARTA_OCULTA_DO_TOPO"],
				},
			},
		};
		const journal = createGameJournal(secret).get();
		const json = exportJournalJson(journal);
		const txt = exportJournalText(journal);
		expect(json).toContain('"available": 1');
		expect(json).not.toContain("CARTA_OCULTA_DO_TOPO");
		expect(json).not.toContain('"rng"');
		expect(json).not.toContain('"seed"');
		expect(txt).not.toContain("CARTA_OCULTA_DO_TOPO");
		expect(txt).toContain("HERÓIS");
		expect(txt).toContain("BARALHOS");
		expect(txt).toContain("ERROS E AVISOS");
	});

	it("usa a mesma origem de modificador para sala e criatura e marca condição contextual", () => {
		const state = started();
		const roomId = "room_crimson_chains_chamber";
		const source = cardAbilityGrants(roomId)[0].abilityId;
		const enemy = {
			id: "enemy_journal",
			cardId: "creature_deep_rift_rat",
			maxLife: 6,
			currentLife: 4,
			damage: 2,
			hitBonus: 1,
			dice: 1,
			tokens: {},
			conditions: [],
			firstDamageTakenThisTurn: false,
			status: "active" as const,
		};
		const world = addComponent(
			upsertEntity(state.world, createEntity(enemy.id, "enemy")),
			enemy.id,
			{
				type: "modifier",
				target: "hit_bonus",
				operation: "add",
				value: 2,
				source,
				duration: { kind: "this_combat" },
				condition: () => true,
			},
		);
		const projection = projectJournalState({
			...state,
			world,
			activeEnemies: [enemy],
			currentRoom: {
				cardId: roomId,
				exits: 3,
				currentEnemies: 1,
				reward: 1,
				rewardType: "item",
				effect: "",
				xp: 2,
				status: "active",
			},
		});
		expect(projection.enemies[0].life).toBe(4);
		expect(projection.enemies[0].modifiers[0].sourceId).toBe(source);
		expect(projection.enemies[0].modifiers[0].conditional).toBe(true);
		expect(projection.roomModifiers[0]).toMatchObject({
			targetId: enemy.id,
			modifier: { sourceId: source, value: 2 },
		});
		expect(JSON.stringify(projection)).not.toContain('condition":');
	});

	it("não atribui novamente uma rolagem antiga a uma ação sem nova rolagem", () => {
		const base = started();
		const withRoll: GameState = {
			...base,
			combat: {
				...base.combat!,
				lastRoll: {
					heroId: base.heroes[0].id,
					enemyId: "enemy_1",
					heroResults: [4],
					heroTotal: 5,
					heroBreakdown: [{ source: "hitBonus", value: 1 }],
					enemyResults: [2],
					enemyTotal: 2,
					enemyBreakdown: [],
				},
			},
		};
		const journal = createGameJournal(withRoll);
		const action = { type: "GAIN_XP" as const, payload: { amount: 1 } };
		const after = reducer(withRoll, action);
		journal.record(action, withRoll, after);
		expect(journal.get().entries[0].roll).toBeNull();
	});

	it("detecta inconsistências sem corrigir ou mutar o estado observado", () => {
		const state = started();
		const invalid: GameState = {
			...state,
			heroes: [
				{
					...state.heroes[0],
					currentLife: state.heroes[0].maxLife + 1,
					activeItems: { hand1: BOW, hand2: CHARM },
					backpack: [BOW, CHARM, BOW, CHARM],
				},
			],
		};
		const projection = projectJournalState(invalid);
		expect(projection.issues.some((issue) => issue.includes("vida"))).toBe(
			true,
		);
		expect(projection.issues.some((issue) => issue.includes("mochila"))).toBe(
			true,
		);
		expect(projection.issues.some((issue) => issue.includes("duas mãos"))).toBe(
			true,
		);
		expect(invalid.heroes[0].currentLife).toBe(state.heroes[0].maxLife + 1);
	});
});

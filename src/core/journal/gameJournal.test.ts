import { describe, expect, it } from "vitest";
import { cardAbilityGrants } from "../data/abilities";
import { addComponent } from "../ecs/world";
import { reducer } from "../reducer";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import { createEmptyCombatState } from "../state/combatState";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import {
	createGameJournal,
	exportJournalJson,
	exportJournalText,
	projectJournalState,
} from "./gameJournal";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, heroesOf, withDecks } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { ensureEntity } from "../__tests__/fixtures";
import { withGame, gameOf } from "../../engine/state";

const HERO = "hero_crimson_barbarian";
const BOW = "item_rift_bow";
const CHARM = "item_silent_dungeon_charm";

function started(): GameState {
	return reducer(testEngine, createInitialGameState({ heroCardIds: [HERO] }), {
		type: "START_GAME",
		payload: { heroCardIds: [HERO], seed: 17, gameId: "journal-test" },
	});
}

describe("diário da partida", () => {
	it("registra preparação, disparo e efeito da reação", () => {
		const base = started();
		const before: GameState = settled(withGame(base, (prevGame) => ({ ...prevGame, status: "HERO_ACTION", combat: createEmptyCombatState(), activeEnemies: [
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
			] })));
		const journal = createGameJournal(testEngine, before);
		const heroId = heroesOf(before)[0]!.id;
		const prepareAction = { type: "USE_SKILL" as const,
			payload: { skillId: "skill_crimson_fury", sourceId: heroId } };
		const prepared = reducer(testEngine, before, prepareAction);
		journal.record(prepareAction, before, prepared);
		const resolved = resolveSkillWindow(testEngine, prepared, {
			event: "evt_attack_declared",
			ctx: { triggeredBy: "evt_attack_declared", sourceHeroId: heroId,
				targetEnemyIds: ["e1"] },
		});
		journal.record({ type: "ROLL_DICE" }, prepared, resolved);
		const [armed, fired] = journal.get().entries;
		expect(armed?.summary).toBe("Preparada: Fúria Rubra");
		expect(armed?.changes).toContain("Fúria Rubra preparado para evt_attack_declared");
		expect(fired?.changes).toContain("Fúria Rubra: preparação encerrada");
		expect(fired?.messages).toContain("Fúria Rubra ativada automaticamente em evt_attack_declared.");
		expect(fired?.changes.some((change) => change.includes("vida"))).toBe(true);
		expect(exportJournalText(testEngine, journal.get())).toContain("Fúria Rubra");
	});
	it("projeta equipamento de duas mãos uma vez, mochila e exaustão do motor", () => {
		const state = started();
		const hero = heroesOf(state)[0];
		const equipped: GameState = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: [
				{
					...hero,
					activeItems: { hand1: BOW, amulet: CHARM },
					backpack: ["item_lesser_vigor_potion"],
				},
			], disabled: {
				[`item:${hero.id}:${CHARM}`]: {
					kind: "item",
					id: `${hero.id}:${CHARM}`,
					scope: "room",
				},
			} })));
		const projection = projectJournalState(testEngine, equipped);
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
		const journal = createGameJournal(testEngine, initial, 2);
		const startAction = {
			type: "START_GAME" as const,
			payload: { heroCardIds: [HERO], seed: 17, gameId: "journal-test" },
		};
		const first = reducer(testEngine, initial, startAction);
		journal.record(startAction, initial, first);
		const secondAction = { type: "GAIN_XP" as const, payload: { amount: 2 } };
		const second = reducer(testEngine, first, secondAction);
		journal.record(secondAction, first, second);
		const third = reducer(testEngine, second, secondAction);
		journal.record(secondAction, second, third);
		const result = journal.get();
		expect(result.entries).toHaveLength(2);
		expect(result.omittedEntries).toBe(1);
		expect(result.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
		expect(result.entries[0].before.groupXp).toBe(gameOf(first).groupXp);
		expect(result.entries[0].after.groupXp).toBe(gameOf(second).groupXp);
		expect(result.current.groupXp).toBe(gameOf(third).groupXp);
		expect(gameOf(first).groupXp).toBe(0);
	});

	it("exporta apenas projeções públicas: não inclui ordem de compra, seed ou RNG", () => {
		const state = started();
		const secret: GameState = withDecks({
			...state,
		}, {
				...decksOf(state),
				dungeonDeck: {
					...deckOf(state, "dungeonDeck"),
					available: ["CARTA_OCULTA_DO_TOPO"],
				},
			});
		const journal = createGameJournal(testEngine, secret).get();
		const json = exportJournalJson(testEngine, journal);
		const txt = exportJournalText(testEngine, journal);
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
			ensureEntity(gameOf(state).world, enemy.id, "enemy"),
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
		const projection = projectJournalState(testEngine, settled(withGame(state, (prevGame) => ({ ...prevGame, world, activeEnemies: [enemy], currentRoom: {
				cardId: roomId,
				exits: 3,
				currentEnemies: 1,
				reward: 1,
				rewardType: "item",
				effect: "",
				xp: 2,
				status: "active",
			} }))));
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
		const withRoll: GameState = withGame(base, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(base).combat!,
				lastRoll: {
					heroId: heroesOf(base)[0].id,
					enemyId: "enemy_1",
					heroResults: [4],
					heroTotal: 5,
					heroBreakdown: [{ source: "hitBonus", value: 1 }],
					enemyResults: [2],
					enemyTotal: 2,
					enemyBreakdown: [],
				},
			} }));
		const journal = createGameJournal(testEngine, withRoll);
		const action = { type: "GAIN_XP" as const, payload: { amount: 1 } };
		const after = reducer(testEngine, withRoll, action);
		journal.record(action, withRoll, after);
		expect(journal.get().entries[0].roll).toBeNull();
	});

	it("detecta inconsistências sem corrigir ou mutar o estado observado", () => {
		const state = started();
		const invalid: GameState = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: [
				{
					...heroesOf(state)[0],
					currentLife: heroesOf(state)[0].maxLife + 1,
					activeItems: { hand1: BOW, hand2: CHARM },
					backpack: [BOW, CHARM, BOW, CHARM],
				},
			] })));
		const projection = projectJournalState(testEngine, invalid);
		expect(projection.issues.some((issue) => issue.includes("vida"))).toBe(
			true,
		);
		expect(projection.issues.some((issue) => issue.includes("mochila"))).toBe(
			true,
		);
		expect(projection.issues.some((issue) => issue.includes("duas mãos"))).toBe(
			true,
		);
		expect(heroesOf(invalid)[0].currentLife).toBe(heroesOf(state)[0].maxLife + 1);
	});
});

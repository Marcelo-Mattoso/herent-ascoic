import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer";
import { canStartHeroAttack } from "../../rules/attackAvailability";
import { playerView } from "../../projection/playerView";
import { manualItemOptions } from "../../rules/itemEffects";
import { applyDamage } from "../../systems/damageSystem";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState, type GameState } from "../../state/gameState";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, heroesOf, withAwakening } from "@/core/state/access";
import { settled } from "../../__tests__/fixtures";
import { pendingSkillTargetOf, pendingTriggerInterruptOf, pendingSkillChoiceOf } from "../../state/access";
import { withGame, gameOf } from "../../../engine/state";

function enemy(id: string): EnemyState {
	return {
		id, cardId: "creature_deep_rift_rat", maxLife: 20, currentLife: 20,
		damage: 1, hitBonus: 0, dice: 1, tokens: {}, conditions: [],
		firstDamageTakenThisTurn: false, status: "active",
	};
}

function combat(heroCardId: string): GameState {
	const initial = createInitialGameState({ heroCardIds: [heroCardId] });
	const started = reducer(testEngine, initial, {
		type: "START_GAME", payload: { heroCardIds: [heroCardId], seed: 42 },
	});
	return reducer(testEngine, settled(withGame(started, (prevGame) => ({ ...prevGame, status: "COMBAT_START", currentRoom: {
			cardId: "room_dungeon_room", exits: 2, currentEnemies: 2,
			reward: 0, rewardType: "item", effect: "", xp: 1, status: "active",
		}, activeEnemies: [enemy("e1"), enemy("e2")] }))), { type: "START_COMBAT" });
}

describe("fluxo de habilidade, preparação e ataque", () => {
	it("Caçador marca só a presa escolhida e ainda ataca com o bônus declarado", () => {
		let state = combat("hero_broken_veil_hunter");
		const heroId = heroesOf(state)[0]!.id;
		state = reducer(testEngine, state, { type: "USE_SKILL", payload: {
			skillId: "skill_prey_mark", sourceId: heroId,
		} });
		expect(pendingSkillTargetOf(state)?.candidates.map((target) => target.id)).toEqual(["e1", "e2"]);
		expect(gameOf(state).combat?.phase).toBe("selecting_hero");
		state = reducer(testEngine, state, { type: "SELECT_SKILL_TARGET", payload: { targetId: "e1" } });
		expect(gameOf(state).combat?.preyByHero[heroId]).toBe("e1");
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1")).toBe(true);
		expect(playerView(testEngine, state).activeInfluences.some((entry) => entry.id === `prey:${heroId}`)).toBe(true);
		state = reducer(testEngine, state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(testEngine, state, { type: "ROLL_DICE" });
		expect(pendingTriggerInterruptOf(state)).toBeUndefined();
		expect(gameOf(state).combat?.lastRoll?.heroBreakdown).toContainEqual({ source: "Marca da Presa", value: 1 });
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
	});

	it("poder preparado do Caçador só dispara ao rolar contra a presa", () => {
		let state = combat("hero_broken_veil_hunter");
		const heroId = heroesOf(state)[0]!.id;
		state = reducer(testEngine, state, { type: "USE_SKILL", payload: {
			skillId: "skill_prey_mark", sourceId: heroId, targetIds: ["e1"],
		} });
		state = reducer(testEngine, state, { type: "USE_POWER", payload: { heroId } });
		expect(Object.values(gameOf(state).preparedAbilities ?? {}).map((entry) => entry.abilityId)).toContain("power_hunter_execution");
		state = reducer(testEngine, state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(testEngine, state, { type: "ROLL_DICE" });
		expect(pendingTriggerInterruptOf(state)).toBeUndefined();
		expect(gameOf(state).combat?.pendingDiceSelection).toBeFalsy();
		expect(gameOf(state).combat?.lastRoll?.heroBreakdown.some((entry) => entry.value === 6)).toBe(true);
		expect(gameOf(state).oncePer.game[`power_hunter_execution::${heroId}`]).toBe(true);
	});

	it("Fúria preparada executa uma vez e não inicia outra rolagem", () => {
		let state = combat("hero_crimson_barbarian");
		const heroId = heroesOf(state)[0]!.id;
		const beforeLife = heroesOf(state)[0]!.currentLife;
		state = reducer(testEngine, state, { type: "USE_SKILL", payload: {
			skillId: "skill_crimson_fury", sourceId: heroId,
		} });
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		state = reducer(testEngine, state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(testEngine, state, { type: "ROLL_DICE" });
		expect(pendingTriggerInterruptOf(state)).toBeUndefined();
		expect(heroesOf(state)[0]!.currentLife).toBe(beforeLife - 2);
		expect(gameOf(state).combat?.lastRoll?.heroResults).toHaveLength(heroesOf(state)[0]!.dice);
		expect(Object.values(gameOf(state).preparedAbilities ?? {})).toHaveLength(0);
		expect(canStartHeroAttack(state, heroId)).toBe(false);
	});

	it("poção equipada cura, é descartada e preserva a oportunidade de ataque", () => {
		let state = combat("hero_eternal_rest_cleric");
		const heroId = heroesOf(state)[0]!.id;
		state = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: heroesOf(state).map((hero) => ({
			...hero, currentLife: hero.currentLife - 4,
			activeItems: { ...hero.activeItems, hand1: "item_lesser_vigor_potion" },
		})) })));
		expect(manualItemOptions(testEngine, state, heroId).map((item) => item.itemId)).toContain("item_lesser_vigor_potion");
		const beforeLife = heroesOf(state)[0]!.currentLife;
		state = reducer(testEngine, state, { type: "USE_ITEM", payload: {
			itemId: "item_lesser_vigor_potion", heroId, targetHeroId: heroId,
		} });
		expect(heroesOf(state)[0]!.currentLife).toBeGreaterThan(beforeLife);
		expect(heroesOf(state)[0]!.activeItems.hand1).toBeUndefined();
		expect(deckOf(state, "itemDeck").discarded).toContain("item_lesser_vigor_potion");
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1")).toBe(true);
	});

	it("item pendente de recompensa não pode ser ativado antes de equipar", () => {
		const base = combat("hero_eternal_rest_cleric");
		const heroId = heroesOf(base)[0]!.id;
		const state: GameState = withGame(base, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE", pendingRewards: [{
				type: "item", cardId: "item_lesser_vigor_potion", requiresBearer: false,
			}] }));
		const result = reducer(testEngine, state, { type: "USE_ITEM", payload: {
			itemId: "item_lesser_vigor_potion", heroId, targetHeroId: heroId,
		} });
		expect(heroesOf(result)[0]!.activeItems).toEqual(heroesOf(state)[0]!.activeItems);
		expect(gameOf(result).pendingRewards).toEqual(gameOf(state).pendingRewards);
		expect(gameOf(result).eventLog.at(-1)).toContain("não pertence ao herói");
	});

	it("passiva condicional só aparece ativa quando a condição é satisfeita", () => {
		const state = combat("hero_last_light_paladin");
		const heroId = heroesOf(state)[0]!.id;
		const manualAttempt = reducer(testEngine, state, { type: "USE_SKILL", payload: {
			skillId: "skill_final_dawn_light", sourceId: heroId,
		} });
		expect(Object.values(gameOf(manualAttempt).preparedAbilities ?? {})).toHaveLength(0);
		const action = playerView(testEngine, state).abilityActionsByHero[heroId]!
			.find((entry) => entry.abilityId === "skill_final_dawn_light")!;
		expect(action.status).toBe("unavailable");
		const awakened = playerView(testEngine, withAwakening(state, 4)).abilityActionsByHero[heroId]!
			.find((entry) => entry.abilityId === "skill_final_dawn_light")!;
		expect(awakened.status).toBe("active");
	});

	it("item reativo preparado protege sem modal e sem consumir ataque", () => {
		let state = combat("hero_eternal_rest_cleric");
		const heroId = heroesOf(state)[0]!.id;
		state = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: heroesOf(state).map((hero) => ({
			...hero, currentLife: 2,
			activeItems: { ...hero.activeItems, amulet: "item_last_defense_charm" },
		})) })));
		expect(manualItemOptions(testEngine, state, heroId).find((item) => item.itemId === "item_last_defense_charm")?.activation).toBe("prepare");
		state = reducer(testEngine, state, { type: "USE_ITEM", payload: {
			itemId: "item_last_defense_charm", heroId,
		} });
		expect(Object.values(gameOf(state).preparedAbilities ?? {})).toHaveLength(1);
		state = applyDamage(testEngine, state, heroId, 5);
		expect(pendingTriggerInterruptOf(state)).toBeUndefined();
		expect(heroesOf(state)[0]?.currentLife).toBe(1);
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		expect(Object.values(gameOf(state).preparedAbilities ?? {})).toHaveLength(0);
	});

	it.each([
		["hero_eternal_rest_cleric", "skill_last_light_healing", "power_greater_last_light_miracle"],
		["hero_broken_bastion_warrior", "skill_bastion_guard", "power_unbreakable_bastion_guard"],
		["hero_rift_rogue", "skill_preserved_path", "power_restored_path"],
		["hero_crimson_rune_mage", "skill_rift_rune", "power_supreme_rift_rune"],
		["hero_crimson_barbarian", "skill_crimson_fury", "power_mighty_crimson_fury"],
		["hero_last_light_paladin", "skill_final_dawn_light", "power_last_light_oath"],
		["hero_broken_veil_hunter", "skill_prey_mark", "power_hunter_execution"],
	])("%s expõe e permite ativar seu poder sem consumir ataque", (cardId, skillId, powerId) => {
		let state = combat(cardId);
		const heroId = heroesOf(state)[0]!.id;
		const actions = playerView(testEngine, state).abilityActionsByHero[heroId]!;
		expect(actions.find((action) => action.abilityId === skillId)).toBeDefined();
		expect(actions.find((action) => action.abilityId === powerId)?.status).toBe("available");
		state = reducer(testEngine, state, { type: "USE_POWER", payload: { heroId } });
		const power = actions.find((action) => action.abilityId === powerId)!;
		if (power.activation === "prepare") {
			expect(Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) => entry.abilityId === powerId)).toBe(true);
		} else {
			expect(gameOf(state).oncePer.game[`${powerId}::${heroId}`]).toBe(true);
		}
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1") || !!pendingSkillChoiceOf(state)).toBe(true);
	});

	it("Eco Profundo do Véu é automático no abate, sem ativação manual", () => {
		const state = combat("hero_deep_veil_necromancer");
		const heroId = heroesOf(state)[0]!.id;
		const actions = playerView(testEngine, state).abilityActionsByHero[heroId]!;
		expect(actions.find((action) => action.abilityId === "power_deep_veil_echo")?.activation).toBe("passive");
		expect(actions.find((action) => action.abilityId === "spend_deep_veil_echo")?.activation).toBe("manual");
	});
});

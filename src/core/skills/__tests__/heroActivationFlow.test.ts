import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer";
import { canStartHeroAttack } from "../../rules/attackAvailability";
import { playerView } from "../../projection/playerView";
import { manualItemOptions } from "../../rules/itemEffects";
import { applyDamage } from "../../systems/damageSystem";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState, type GameState } from "../../state/gameState";

function enemy(id: string): EnemyState {
	return {
		id, cardId: "creature_deep_rift_rat", maxLife: 20, currentLife: 20,
		damage: 1, hitBonus: 0, dice: 1, tokens: {}, conditions: [],
		firstDamageTakenThisTurn: false, status: "active",
	};
}

function combat(heroCardId: string): GameState {
	const initial = createInitialGameState({ heroCardIds: [heroCardId] });
	const started = reducer(initial, {
		type: "START_GAME", payload: { heroCardIds: [heroCardId], seed: 42 },
	});
	return reducer({
		...started,
		status: "COMBAT_START",
		currentRoom: {
			cardId: "room_dungeon_room", exits: 2, currentEnemies: 2,
			reward: 0, rewardType: "item", effect: "", xp: 1, status: "active",
		},
		activeEnemies: [enemy("e1"), enemy("e2")],
	}, { type: "START_COMBAT" });
}

describe("fluxo de habilidade, preparação e ataque", () => {
	it("Caçador marca só a presa escolhida e ainda ataca com o bônus declarado", () => {
		let state = combat("hero_broken_veil_hunter");
		const heroId = state.heroes[0]!.id;
		state = reducer(state, { type: "USE_SKILL", payload: {
			skillId: "skill_prey_mark", sourceId: heroId,
		} });
		expect(state.pendingSkillTarget?.candidates.map((target) => target.id)).toEqual(["e1", "e2"]);
		expect(state.combat?.phase).toBe("selecting_hero");
		state = reducer(state, { type: "SELECT_SKILL_TARGET", payload: { targetId: "e1" } });
		expect(state.combat?.preyByHero[heroId]).toBe("e1");
		expect(state.combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1")).toBe(true);
		expect(playerView(state).activeInfluences.some((entry) => entry.id === `prey:${heroId}`)).toBe(true);
		state = reducer(state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(state, { type: "ROLL_DICE" });
		expect(state.pendingTriggerInterrupt).toBeUndefined();
		expect(state.combat?.lastRoll?.heroBreakdown).toContainEqual({ source: "Marca da Presa", value: 1 });
		expect(state.combat?.heroesActed).toEqual([]);
	});

	it("poder preparado do Caçador só dispara ao rolar contra a presa", () => {
		let state = combat("hero_broken_veil_hunter");
		const heroId = state.heroes[0]!.id;
		state = reducer(state, { type: "USE_SKILL", payload: {
			skillId: "skill_prey_mark", sourceId: heroId, targetIds: ["e1"],
		} });
		state = reducer(state, { type: "USE_POWER", payload: { heroId } });
		expect(Object.values(state.preparedAbilities ?? {}).map((entry) => entry.abilityId)).toContain("power_hunter_execution");
		state = reducer(state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(state, { type: "ROLL_DICE" });
		expect(state.pendingTriggerInterrupt).toBeUndefined();
		expect(state.combat?.pendingDiceSelection?.skillId).toBe("power_hunter_execution");
		expect(state.oncePer.game[`power_hunter_execution::${heroId}`]).toBe(true);
	});

	it("Fúria preparada executa uma vez e não inicia outra rolagem", () => {
		let state = combat("hero_crimson_barbarian");
		const heroId = state.heroes[0]!.id;
		const beforeLife = state.heroes[0]!.currentLife;
		state = reducer(state, { type: "USE_SKILL", payload: {
			skillId: "skill_crimson_fury", sourceId: heroId,
		} });
		expect(state.combat?.heroesActed).toEqual([]);
		state = reducer(state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId: "e1" } });
		state = reducer(state, { type: "ROLL_DICE" });
		expect(state.pendingTriggerInterrupt).toBeUndefined();
		expect(state.heroes[0]!.currentLife).toBe(beforeLife - 2);
		expect(state.combat?.lastRoll?.heroResults).toHaveLength(state.heroes[0]!.dice);
		expect(Object.values(state.preparedAbilities ?? {})).toHaveLength(0);
		expect(canStartHeroAttack(state, heroId)).toBe(false);
	});

	it("poção equipada cura, é descartada e preserva a oportunidade de ataque", () => {
		let state = combat("hero_eternal_rest_cleric");
		const heroId = state.heroes[0]!.id;
		state = { ...state, heroes: state.heroes.map((hero) => ({
			...hero, currentLife: hero.currentLife - 4,
			activeItems: { ...hero.activeItems, hand1: "item_lesser_vigor_potion" },
		})) };
		expect(manualItemOptions(state, heroId).map((item) => item.itemId)).toContain("item_lesser_vigor_potion");
		const beforeLife = state.heroes[0]!.currentLife;
		state = reducer(state, { type: "USE_ITEM", payload: {
			itemId: "item_lesser_vigor_potion", heroId, targetHeroId: heroId,
		} });
		expect(state.heroes[0]!.currentLife).toBeGreaterThan(beforeLife);
		expect(state.heroes[0]!.activeItems.hand1).toBeUndefined();
		expect(state.decks.itemDeck.discarded).toContain("item_lesser_vigor_potion");
		expect(state.combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1")).toBe(true);
	});

	it("item pendente de recompensa não pode ser ativado antes de equipar", () => {
		const base = combat("hero_eternal_rest_cleric");
		const heroId = base.heroes[0]!.id;
		const state: GameState = {
			...base, status: "REWARD_PHASE", pendingRewards: [{
				type: "item", cardId: "item_lesser_vigor_potion", requiresBearer: false,
			}],
		};
		const result = reducer(state, { type: "USE_ITEM", payload: {
			itemId: "item_lesser_vigor_potion", heroId, targetHeroId: heroId,
		} });
		expect(result.heroes[0]!.activeItems).toEqual(state.heroes[0]!.activeItems);
		expect(result.pendingRewards).toEqual(state.pendingRewards);
		expect(result.eventLog.at(-1)).toContain("não pertence ao herói");
	});

	it("passiva condicional só aparece ativa quando a condição é satisfeita", () => {
		const state = combat("hero_last_light_paladin");
		const heroId = state.heroes[0]!.id;
		const manualAttempt = reducer(state, { type: "USE_SKILL", payload: {
			skillId: "skill_final_dawn_light", sourceId: heroId,
		} });
		expect(Object.values(manualAttempt.preparedAbilities ?? {})).toHaveLength(0);
		const action = playerView(state).abilityActionsByHero[heroId]!
			.find((entry) => entry.abilityId === "skill_final_dawn_light")!;
		expect(action.status).toBe("unavailable");
		const awakened = playerView({ ...state, despertar: 4 }).abilityActionsByHero[heroId]!
			.find((entry) => entry.abilityId === "skill_final_dawn_light")!;
		expect(awakened.status).toBe("active");
	});

	it("item reativo preparado protege sem modal e sem consumir ataque", () => {
		let state = combat("hero_eternal_rest_cleric");
		const heroId = state.heroes[0]!.id;
		state = { ...state, heroes: state.heroes.map((hero) => ({
			...hero, currentLife: 2,
			activeItems: { ...hero.activeItems, amulet: "item_last_defense_charm" },
		})) };
		expect(manualItemOptions(state, heroId).find((item) => item.itemId === "item_last_defense_charm")?.activation).toBe("prepare");
		state = reducer(state, { type: "USE_ITEM", payload: {
			itemId: "item_last_defense_charm", heroId,
		} });
		expect(Object.values(state.preparedAbilities ?? {})).toHaveLength(1);
		state = applyDamage(state, heroId, 5);
		expect(state.pendingTriggerInterrupt).toBeUndefined();
		expect(state.heroes[0]?.currentLife).toBe(1);
		expect(state.combat?.heroesActed).toEqual([]);
		expect(Object.values(state.preparedAbilities ?? {})).toHaveLength(0);
	});

	it.each([
		["hero_eternal_rest_cleric", "skill_last_light_healing", "power_greater_last_light_miracle"],
		["hero_broken_bastion_warrior", "skill_bastion_guard", "power_unbreakable_bastion_guard"],
		["hero_rift_rogue", "skill_preserved_path", "power_restored_path"],
		["hero_crimson_rune_mage", "skill_rift_rune", "power_supreme_rift_rune"],
		["hero_crimson_barbarian", "skill_crimson_fury", "power_mighty_crimson_fury"],
		["hero_last_light_paladin", "skill_final_dawn_light", "power_last_light_oath"],
		["hero_deep_veil_necromancer", "skill_return_rite", "power_deep_veil_echo"],
		["hero_broken_veil_hunter", "skill_prey_mark", "power_hunter_execution"],
	])("%s expõe e permite ativar seu poder sem consumir ataque", (cardId, skillId, powerId) => {
		let state = combat(cardId);
		const heroId = state.heroes[0]!.id;
		const actions = playerView(state).abilityActionsByHero[heroId]!;
		expect(actions.find((action) => action.abilityId === skillId)).toBeDefined();
		expect(actions.find((action) => action.abilityId === powerId)?.status).toBe("available");
		state = reducer(state, { type: "USE_POWER", payload: { heroId } });
		const power = actions.find((action) => action.abilityId === powerId)!;
		if (power.activation === "prepare") {
			expect(Object.values(state.preparedAbilities ?? {}).some((entry) => entry.abilityId === powerId)).toBe(true);
		} else {
			expect(state.oncePer.game[`${powerId}::${heroId}`]).toBe(true);
		}
		expect(state.combat?.heroesActed).toEqual([]);
		expect(canStartHeroAttack(state, heroId, "e1") || !!state.pendingSkillChoice).toBe(true);
	});
});

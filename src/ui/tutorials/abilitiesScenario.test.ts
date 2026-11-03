import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer";
import { playerView } from "@/core/projection/playerView";
import { ABILITY_BARBARIAN, ABILITY_HUNTER, ABILITY_WARRIOR, BASTION_POWER, CRIMSON_FURY, PREY_MARK, prepareAbilityEncounter, preparePowerAndPassiveEncounter } from "./abilitiesScenario";
import { testEngine } from "@/core/__tests__/testEngine";
import { enemiesOf, heroesOf, pendingSkillTargetOf, pendingTriggerInterruptOf } from "../../core/state/access";
import { gameOf } from "../../engine/state";

describe("Arquivo IV: checkpoints do motor", () => {
	it("permite marcar uma presa e atacar sem consumir o ataque ao usar a habilidade", () => {
		let state = prepareAbilityEncounter(testEngine, ABILITY_HUNTER);
		const heroId = heroesOf(state)[0].id;
		expect(playerView(testEngine, state).abilityActionsByHero[heroId].find((entry) => entry.abilityId === PREY_MARK)?.status).toBe("available");
		state = reducer(testEngine, state, { type: "USE_SKILL", payload: { skillId: PREY_MARK, sourceId: heroId } });
		expect(pendingSkillTargetOf(state)?.candidates.length).toBeGreaterThan(0);
		const enemyId = pendingSkillTargetOf(state)!.candidates[0].id;
		state = reducer(testEngine, state, { type: "SELECT_SKILL_TARGET", payload: { targetId: enemyId } });
		expect(gameOf(state).combat?.preyByHero[heroId]).toBe(enemyId);
		expect(gameOf(state).combat?.heroesActed).toEqual([]);
		state = reducer(testEngine, state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		state = reducer(testEngine, state, { type: "ROLL_DICE" });
		state = reducer(testEngine, state, { type: "RESOLVE_ATTACK" });
		expect(gameOf(state).combat?.heroesActed).toContain(heroId);
	});

	it("prepara Fúria, executa uma vez no ataque e preserva o poder manual do Guerreiro", () => {
		let state = prepareAbilityEncounter(testEngine, ABILITY_BARBARIAN);
		const heroId = heroesOf(state)[0].id;
		state = reducer(testEngine, state, { type: "USE_SKILL", payload: { skillId: CRIMSON_FURY, sourceId: heroId } });
		expect(Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) => entry.abilityId === CRIMSON_FURY)).toBe(true);
		const life = heroesOf(state)[0].currentLife;
		const enemyId = enemiesOf(state)[0].id;
		state = reducer(testEngine, state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		state = reducer(testEngine, state, { type: "ROLL_DICE" });
		expect(heroesOf(state)[0].currentLife).toBe(life - 2);
		expect(Object.values(gameOf(state).preparedAbilities ?? {})).toHaveLength(0);
		expect(pendingTriggerInterruptOf(state)).toBeUndefined();
		state = reducer(testEngine, state, { type: "RESOLVE_ATTACK" });
		expect(gameOf(state).combat?.heroesActed).toContain(heroId);

		let power = preparePowerAndPassiveEncounter(testEngine);
		expect(heroesOf(power)[0].cardId).toBe(ABILITY_WARRIOR);
		expect(playerView(testEngine, power).activeInfluences.some((entry) => entry.from.kind === "item" && entry.from.id === "item_low_flame_charm")).toBe(true);
		const powerHeroId = heroesOf(power)[0].id;
		expect(playerView(testEngine, power).abilityActionsByHero[powerHeroId].find((entry) => entry.abilityId === BASTION_POWER)?.status).toBe("available");
		power = reducer(testEngine, power, { type: "USE_POWER", payload: { heroId: powerHeroId } });
		expect(gameOf(power).oncePer.game[`${BASTION_POWER}::${powerHeroId}`]).toBe(true);
		expect(gameOf(power).combat?.heroesActed).toEqual([]);
		expect(playerView(testEngine, power).abilityActionsByHero[powerHeroId].find((entry) => entry.abilityId === BASTION_POWER)?.status).toBe("exhausted");
	});
});

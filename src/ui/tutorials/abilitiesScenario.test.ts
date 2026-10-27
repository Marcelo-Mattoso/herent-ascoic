import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer";
import { playerView } from "@/core/projection/playerView";
import { ABILITY_BARBARIAN, ABILITY_HUNTER, ABILITY_WARRIOR, BASTION_POWER, CRIMSON_FURY, PREY_MARK, prepareAbilityEncounter, preparePowerAndPassiveEncounter } from "./abilitiesScenario";

describe("Arquivo IV: checkpoints do motor", () => {
	it("permite marcar uma presa e atacar sem consumir o ataque ao usar a habilidade", () => {
		let state = prepareAbilityEncounter(ABILITY_HUNTER);
		const heroId = state.heroes[0].id;
		expect(playerView(state).abilityActionsByHero[heroId].find((entry) => entry.abilityId === PREY_MARK)?.status).toBe("available");
		state = reducer(state, { type: "USE_SKILL", payload: { skillId: PREY_MARK, sourceId: heroId } });
		expect(state.pendingSkillTarget?.candidates.length).toBeGreaterThan(0);
		const enemyId = state.pendingSkillTarget!.candidates[0].id;
		state = reducer(state, { type: "SELECT_SKILL_TARGET", payload: { targetId: enemyId } });
		expect(state.combat?.preyByHero[heroId]).toBe(enemyId);
		expect(state.combat?.heroesActed).toEqual([]);
		state = reducer(state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		state = reducer(state, { type: "ROLL_DICE" });
		state = reducer(state, { type: "RESOLVE_ATTACK" });
		expect(state.combat?.heroesActed).toContain(heroId);
	});

	it("prepara Fúria, executa uma vez no ataque e preserva o poder manual do Guerreiro", () => {
		let state = prepareAbilityEncounter(ABILITY_BARBARIAN);
		const heroId = state.heroes[0].id;
		state = reducer(state, { type: "USE_SKILL", payload: { skillId: CRIMSON_FURY, sourceId: heroId } });
		expect(Object.values(state.preparedAbilities ?? {}).some((entry) => entry.abilityId === CRIMSON_FURY)).toBe(true);
		const life = state.heroes[0].currentLife;
		const enemyId = state.activeEnemies[0].id;
		state = reducer(state, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		state = reducer(state, { type: "ROLL_DICE" });
		expect(state.heroes[0].currentLife).toBe(life - 2);
		expect(Object.values(state.preparedAbilities ?? {})).toHaveLength(0);
		expect(state.pendingTriggerInterrupt).toBeUndefined();
		state = reducer(state, { type: "RESOLVE_ATTACK" });
		expect(state.combat?.heroesActed).toContain(heroId);

		let power = preparePowerAndPassiveEncounter();
		expect(power.heroes[0].cardId).toBe(ABILITY_WARRIOR);
		expect(playerView(power).activeInfluences.some((entry) => entry.from.kind === "item" && entry.from.id === "item_low_flame_charm")).toBe(true);
		const powerHeroId = power.heroes[0].id;
		expect(playerView(power).abilityActionsByHero[powerHeroId].find((entry) => entry.abilityId === BASTION_POWER)?.status).toBe("available");
		power = reducer(power, { type: "USE_POWER", payload: { heroId: powerHeroId } });
		expect(power.oncePer.game[`${BASTION_POWER}::${powerHeroId}`]).toBe(true);
		expect(power.combat?.heroesActed).toEqual([]);
		expect(playerView(power).abilityActionsByHero[powerHeroId].find((entry) => entry.abilityId === BASTION_POWER)?.status).toBe("exhausted");
	});
});

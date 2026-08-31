import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer/index";
import { createInitialGameState } from "../../state/gameState";
import type { HealthComponent } from "../types";
import { getComponent, query } from "../world";

function buildStartedState(heroNames = ["hero_crimson_barbarian"]) {
	const base = createInitialGameState({ heroCardIds: heroNames });
	return reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds: heroNames },
	});
}

describe("sincronização world após START_GAME", () => {
	it("world começa vazio antes de START_GAME", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		expect(Object.keys(base.world.entities)).toHaveLength(0);
	});

	it("world tem 1 entidade por herói após START_GAME", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const heroes = query(state.world, (e) => e.type === "hero");
		expect(heroes).toHaveLength(1);
	});

	it("world tem 2 entidades para 2 heróis", () => {
		const state = buildStartedState([
			"hero_crimson_barbarian",
			"hero_crimson_barbarian",
		]);
		const heroes = query(state.world, (e) => e.type === "hero");
		expect(heroes).toHaveLength(2);
	});

	it("entidade de herói tem HealthComponent com vida correta", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const heroState = state.heroes[0]!;
		const health = getComponent<HealthComponent>(
			state.world,
			heroState.id,
			"health",
		);
		expect(health).toBeDefined();
		expect(health?.current).toBe(heroState.currentLife);
		expect(health?.max).toBe(heroState.maxLife);
	});

	it("entidade de herói tem DamageStatComponent", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const heroState = state.heroes[0]!;
		const damageStat = getComponent(state.world, heroState.id, "damage_stat");
		expect(damageStat).toBeDefined();
	});

	it("entidade de herói tem DiceComponent", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const heroState = state.heroes[0]!;
		const dice = getComponent(state.world, heroState.id, "dice");
		expect(dice).toBeDefined();
	});

	it("sem inimigos no world após START_GAME (spawn acontece depois)", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const enemies = query(state.world, (e) => e.type === "enemy");
		expect(enemies).toHaveLength(0);
	});

	it("IDs das entidades correspondem aos IDs dos heróis", () => {
		const state = buildStartedState(["hero_crimson_barbarian"]);
		const heroIds = state.heroes.map((h) => h.id).sort();
		const worldHeroIds = query(state.world, (e) => e.type === "hero")
			.map((e) => e.id)
			.sort();
		expect(worldHeroIds).toEqual(heroIds);
	});
});

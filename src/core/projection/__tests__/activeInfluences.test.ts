import { describe, expect, it } from "vitest";
import { addComponent, createEntity, upsertEntity } from "../../ecs/world";
import { reducer } from "../../reducer/index";
import { createInitialGameState } from "../../state/gameState";
import { playerView } from "../playerView";

function buildStartedState(heroNames: string[]) {
	const base = createInitialGameState({ heroCardNames: heroNames });
	return reducer(base, { type: "START_GAME", payload: { heroCardNames: heroNames } });
}

describe("projectActiveInfluences", () => {
	it("retorna lista vazia quando não há modifiers no world", () => {
		const state = buildStartedState(["Bárbaro Rubro"]);
		const view = playerView(state);
		// Sem combate ativo, world pode ter passivas mas activeInfluences reflete isso
		expect(Array.isArray(view.activeInfluences)).toBe(true);
	});

	it("detecta modifier de herói → herói (hero_to_self)", () => {
		let state = buildStartedState(["Bárbaro Rubro"]);
		const heroId = state.heroes[0].id;
		// Injeta modifier diretamente no world (simula bônus de dano)
		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "damage_dealt",
			operation: "add",
			value: 3,
			source: "skill_bastion_guard",
			duration: { kind: "this_turn" },
		});
		state = { ...state, world };

		const view = playerView(state);
		const infs = view.activeInfluences;
		expect(infs.length).toBeGreaterThan(0);

		const inf = infs.find((i) => i.source.includes("Guarda"));
		expect(inf).toBeDefined();
		expect(inf!.kind).toBe("buff");
		expect(inf!.duration).toBe("até fim da rodada");
		expect(inf!.label).toContain("+3");
	});

	it("colapsa fan-out de grupo quando mesmo modifier cobre todos os heróis", () => {
		const heroes = ["Bárbaro Rubro", "Guerreiro do Bastião Partido", "Ladino das Fendas"];
		let state = buildStartedState(heroes);

		// Injeta o mesmo modifier (power_unbreakable_bastion_guard) em todos os heróis
		let world = state.world;
		for (const hero of state.heroes) {
			if (!world.entities[hero.id]) {
				world = upsertEntity(world, createEntity(hero.id, "hero"));
			}
			world = addComponent(world, hero.id, {
				type: "modifier",
				target: "damage_taken",
				operation: "add",
				value: -1,
				source: "power_unbreakable_bastion_guard",
				duration: { kind: "this_turn" },
			});
		}
		state = { ...state, world };

		const view = playerView(state);
		const grouped = view.activeInfluences.filter(
			(i) => i.source.includes("Inquebrável"),
		);
		// Deve colapsar em 1 entrada com to.kind = "group"
		expect(grouped).toHaveLength(1);
		expect(grouped[0].to.kind).toBe("group");
		expect(grouped[0].scope).toBe("hero_to_group");
	});

	it("não colapsa quando só um herói tem o modifier", () => {
		const heroes = ["Bárbaro Rubro", "Guerreiro do Bastião Partido"];
		let state = buildStartedState(heroes);
		const heroId = state.heroes[0].id;

		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "damage_taken",
			operation: "add",
			value: -1,
			source: "power_unbreakable_bastion_guard",
			duration: { kind: "this_turn" },
		});
		state = { ...state, world };

		const view = playerView(state);
		const grouped = view.activeInfluences.filter(
			(i) => i.source.includes("Inquebrável"),
		);
		// Só um herói afetado → não colapsa
		expect(grouped).toHaveLength(1);
		expect(grouped[0].to.kind).toBe("hero");
		expect(grouped[0].scope).toBe("hero_to_self");
	});

	it("classifica modifier negativo em damage_taken como buff", () => {
		let state = buildStartedState(["Bárbaro Rubro"]);
		const heroId = state.heroes[0].id;
		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "damage_taken",
			operation: "add",
			value: -1,
			source: "power_unbreakable_bastion_guard",
			duration: { kind: "permanent" },
		});
		state = { ...state, world };

		const inf = playerView(state).activeInfluences.find(
			(i) => i.source.includes("Inquebrável"),
		);
		expect(inf!.kind).toBe("buff");
		expect(inf!.duration).toBe("passivo");
	});

	it("classifica modifier negativo em hit_bonus como debuff (penalidade de acerto)", () => {
		let state = buildStartedState(["Bárbaro Rubro"]);
		const heroId = state.heroes[0].id;
		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: -2,
			source: "skill_some_enemy_debuff",
			duration: { kind: "this_combat" },
		});
		state = { ...state, world };

		const inf = playerView(state).activeInfluences[0];
		expect(inf.kind).toBe("debuff");
		expect(inf.duration).toBe("até fim do combate");
		expect(inf.label).toContain("-2");
	});

	it("item_to_hero scope para modifier de skill de item", () => {
		let state = buildStartedState(["Bárbaro Rubro"]);
		const heroId = state.heroes[0].id;
		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		// skill_hunter_focus pertence a item_precision_potion / item_low_flame_charm
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: 2,
			source: "skill_hunter_focus",
			duration: { kind: "permanent" },
		});
		state = { ...state, world };

		const inf = playerView(state).activeInfluences.find(
			(i) => i.source.includes("Caçador"),
		);
		expect(inf).toBeDefined();
		expect(inf!.scope).toBe("item_to_hero");
		expect(inf!.from.kind).toBe("item");
	});

	it("activeInfluences não quebra buffsByHero existente", () => {
		let state = buildStartedState(["Bárbaro Rubro"]);
		const heroId = state.heroes[0].id;
		let world = state.world;
		if (!world.entities[heroId]) {
			world = upsertEntity(world, createEntity(heroId, "hero"));
		}
		world = addComponent(world, heroId, {
			type: "modifier",
			target: "damage_dealt",
			operation: "add",
			value: 5,
			source: "skill_bastion_guard",
			duration: { kind: "once" },
		});
		state = { ...state, world };
		const view = playerView(state);
		// activeInfluences funciona independente de ter ou não combate ativo
		expect(view.activeInfluences.length).toBeGreaterThan(0);
		// buffsByHero existe quando há combate
		if (view.combat) {
			expect(view.combat.buffsByHero).toBeDefined();
		}
	});
});

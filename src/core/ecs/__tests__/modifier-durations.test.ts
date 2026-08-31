import { describe, expect, it } from "vitest";
import type { ModifierComponent } from "../types";
import {
	addComponent,
	createEmptyWorld,
	createEntity,
	decrementRoundsModifiers,
	getComponents,
	removeModifiersForSource,
	tickModifierDurations,
	upsertEntity,
} from "../world";

function makeWorld(entityId: string, mods: Omit<ModifierComponent, "type">[]) {
	let world = createEmptyWorld();
	world = upsertEntity(world, createEntity(entityId, "hero"));
	for (const mod of mods) {
		world = addComponent(world, entityId, { type: "modifier", ...mod });
	}
	return world;
}

function modCount(world: ReturnType<typeof makeWorld>, entityId: string) {
	return getComponents<ModifierComponent>(world, entityId, "modifier").length;
}

describe("tickModifierDurations", () => {
	it("remove 'this_turn' (until_end_of_round) no end_of_round", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_taken",
				operation: "add",
				value: 1,
				source: "s1",
				duration: { kind: "this_turn" },
			},
			{
				target: "hit_bonus",
				operation: "add",
				value: 2,
				source: "s2",
				duration: { kind: "this_combat" },
			},
		]);
		const after = tickModifierDurations(world, "end_of_round");
		expect(modCount(after, "hero_1")).toBe(1);
		const remaining = getComponents<ModifierComponent>(
			after,
			"hero_1",
			"modifier",
		);
		expect(remaining[0]?.duration.kind).toBe("this_combat");
	});

	it("mantém 'this_combat' no end_of_round", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_taken",
				operation: "add",
				value: 1,
				source: "s1",
				duration: { kind: "this_combat" },
			},
		]);
		const after = tickModifierDurations(world, "end_of_round");
		expect(modCount(after, "hero_1")).toBe(1);
	});

	it("mantém 'permanent' no end_of_round", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_taken",
				operation: "add",
				value: 1,
				source: "s1",
				duration: { kind: "permanent" },
			},
		]);
		const after = tickModifierDurations(world, "end_of_round");
		expect(modCount(after, "hero_1")).toBe(1);
	});

	it("remove 'this_combat' no end_of_combat", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_taken",
				operation: "add",
				value: 1,
				source: "s1",
				duration: { kind: "this_combat" },
			},
			{
				target: "hit_bonus",
				operation: "add",
				value: 2,
				source: "s2",
				duration: { kind: "permanent" },
			},
		]);
		const after = tickModifierDurations(world, "end_of_combat");
		expect(modCount(after, "hero_1")).toBe(1);
	});

	it("remove 'once' no once_consumed", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_dealt",
				operation: "add",
				value: 3,
				source: "s1",
				duration: { kind: "once" },
			},
			{
				target: "damage_taken",
				operation: "add",
				value: 1,
				source: "s2",
				duration: { kind: "this_combat" },
			},
		]);
		const after = tickModifierDurations(world, "once_consumed");
		expect(modCount(after, "hero_1")).toBe(1);
		const remaining = getComponents<ModifierComponent>(
			after,
			"hero_1",
			"modifier",
		);
		expect(remaining[0]?.duration.kind).toBe("this_combat");
	});
});

describe("decrementRoundsModifiers", () => {
	it("decrementa remaining de 2 para 1 após 1 tick de end_of_round", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_dealt",
				operation: "add",
				value: 5,
				source: "s1",
				duration: { kind: "rounds", remaining: 2 },
			},
		]);
		const after = decrementRoundsModifiers(world);
		expect(modCount(after, "hero_1")).toBe(1);
		const mods = getComponents<ModifierComponent>(after, "hero_1", "modifier");
		const dur = mods[0]?.duration;
		expect(dur?.kind).toBe("rounds");
		expect((dur as { kind: "rounds"; remaining: number }).remaining).toBe(1);
	});

	it("remove modifier com remaining === 1 após 1 tick (expira)", () => {
		const world = makeWorld("hero_1", [
			{
				target: "damage_dealt",
				operation: "add",
				value: 5,
				source: "s1",
				duration: { kind: "rounds", remaining: 1 },
			},
			{
				target: "hit_bonus",
				operation: "add",
				value: 2,
				source: "s2",
				duration: { kind: "this_combat" },
			},
		]);
		const after = decrementRoundsModifiers(world);
		expect(modCount(after, "hero_1")).toBe(1);
		const mods = getComponents<ModifierComponent>(after, "hero_1", "modifier");
		expect(mods[0]?.duration.kind).toBe("this_combat");
	});
});

describe("removeModifiersForSource", () => {
	it("remove while_source_in_play de outras entidades quando fonte é removida", () => {
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("enemy_1", "enemy"));
		world = upsertEntity(world, createEntity("hero_1", "hero"));
		world = addComponent(world, "hero_1", {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: -2,
			source: "skill_gelatinous_body",
			duration: { kind: "while_source_in_play" },
			sourceEntityId: "enemy_1",
		});
		// Simula remoção da entidade-fonte e limpeza dos seus modifiers
		const after = removeModifiersForSource(world, "enemy_1");
		expect(modCount(after, "hero_1")).toBe(0);
	});

	it("não remove modifiers de outras fontes", () => {
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("enemy_1", "enemy"));
		world = upsertEntity(world, createEntity("hero_1", "hero"));
		world = addComponent(world, "hero_1", {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: -2,
			source: "skill_other",
			duration: { kind: "while_source_in_play" },
			sourceEntityId: "enemy_2", // fonte diferente
		});
		const after = removeModifiersForSource(world, "enemy_1");
		expect(modCount(after, "hero_1")).toBe(1); // mantido
	});
});

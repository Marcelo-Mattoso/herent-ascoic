import { describe, expect, it } from "vitest";
import type { ModifierComponent } from "../types";
import { addComponent, createEmptyWorld, createEntity, getModifierTotal, upsertEntity } from "../world";

function makeWorld(entityId: string, mods: Omit<ModifierComponent, "type">[]) {
	let world = createEmptyWorld();
	world = upsertEntity(world, createEntity(entityId, "hero"));
	for (const mod of mods) {
		world = addComponent(world, entityId, { type: "modifier", ...mod });
	}
	return world;
}

const BASE_MOD: Omit<ModifierComponent, "type" | "value" | "operation"> = {
	target: "damage_taken",
	source: "skill_test",
	duration: { kind: "permanent" },
};

describe("getModifierTotal", () => {
	it("retorna 0 para entidade ausente", () => {
		const world = createEmptyWorld();
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(0);
	});

	it("retorna 0 sem modificadores", () => {
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("hero_1", "hero"));
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(0);
	});

	it("soma múltiplas entradas add", () => {
		const world = makeWorld("hero_1", [
			{ ...BASE_MOD, operation: "add", value: 2 },
			{ ...BASE_MOD, operation: "add", value: 3 },
		]);
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(5);
	});

	it("set sobrescreve — último set vence", () => {
		const world = makeWorld("hero_1", [
			{ ...BASE_MOD, operation: "add", value: 10 },
			{ ...BASE_MOD, operation: "set", value: 4 },
			{ ...BASE_MOD, operation: "set", value: 7 },
		]);
		// set=7 é o último; add=10 não influencia quando set existe
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(7);
	});

	it("clamp respeita max (value positivo)", () => {
		const world = makeWorld("hero_1", [
			{ ...BASE_MOD, operation: "add", value: 10 },
			{ ...BASE_MOD, operation: "clamp", value: 5 },
		]);
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(5);
	});

	it("clamp respeita min (value negativo)", () => {
		const world = makeWorld("hero_1", [
			{ ...BASE_MOD, operation: "add", value: -10 },
			{ ...BASE_MOD, operation: "clamp", value: -3 },
		]);
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(-3);
	});

	it("filtra por target corretamente", () => {
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("hero_1", "hero"));
		world = addComponent(world, "hero_1", {
			type: "modifier",
			target: "damage_taken",
			operation: "add",
			value: 5,
			source: "s1",
			duration: { kind: "permanent" },
		});
		world = addComponent(world, "hero_1", {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: 3,
			source: "s2",
			duration: { kind: "permanent" },
		});
		expect(getModifierTotal(world, "hero_1", "damage_taken")).toBe(5);
		expect(getModifierTotal(world, "hero_1", "hit_bonus")).toBe(3);
	});
});

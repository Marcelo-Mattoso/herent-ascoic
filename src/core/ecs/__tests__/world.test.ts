import { describe, expect, it } from "vitest";
import type { Component, HealthComponent } from "../types";
import {
	addComponent,
	createEmptyWorld,
	createEntity,
	getComponent,
	getComponents,
	hasComponent,
	query,
	queryWithComponent,
	removeComponent,
	removeEntity,
	updateComponent,
	upsertEntity,
} from "../world";

const health: HealthComponent = {
	type: "health",
	current: 10,
	max: 10,
	healBlocked: false,
};

describe("createEmptyWorld", () => {
	it("começa sem entidades", () => {
		const world = createEmptyWorld();
		expect(Object.keys(world.entities)).toHaveLength(0);
	});
});

describe("upsertEntity + removeEntity", () => {
	it("adiciona e remove entidades", () => {
		const entity = createEntity("e1", "hero", [health]);
		const w1 = upsertEntity(createEmptyWorld(), entity);
		expect(w1.entities["e1"]).toBeDefined();

		const w2 = removeEntity(w1, "e1");
		expect(w2.entities["e1"]).toBeUndefined();
	});

	it("upsert substitui entidade existente", () => {
		const e1 = createEntity("e1", "hero", [health]);
		const e1b = createEntity("e1", "hero", [{ ...health, current: 5 }]);
		const w = upsertEntity(upsertEntity(createEmptyWorld(), e1), e1b);
		expect(getComponent<HealthComponent>(w, "e1", "health")?.current).toBe(5);
	});
});

describe("getComponent / getComponents", () => {
	it("retorna o componente adicionado", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", [health]));
		const c = getComponent<HealthComponent>(w, "e1", "health");
		expect(c).toEqual(health);
	});

	it("retorna undefined para entidade ausente", () => {
		expect(getComponent(createEmptyWorld(), "nope", "health")).toBeUndefined();
	});

	it("getComponents retorna todos os componentes do tipo", () => {
		const c1: Component = { type: "condition", conditionType: "burning", duration: { kind: "this_turn" } };
		const c2: Component = { type: "condition", conditionType: "frozen", duration: { kind: "rounds", remaining: 2 } };
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", [c1, c2]));
		expect(getComponents(w, "e1", "condition")).toHaveLength(2);
	});
});

describe("hasComponent", () => {
	it("retorna true para componente presente, false para ausente", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", [health]));
		expect(hasComponent(w, "e1", "health")).toBe(true);
		expect(hasComponent(w, "e1", "dice")).toBe(false);
	});
});

describe("addComponent", () => {
	it("adiciona componente à entidade existente", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", []));
		w = addComponent(w, "e1", health);
		expect(hasComponent(w, "e1", "health")).toBe(true);
	});

	it("retorna world intocado para entidade inexistente", () => {
		const w = createEmptyWorld();
		const w2 = addComponent(w, "nope", health);
		expect(w2).toBe(w);
	});
});

describe("removeComponent", () => {
	it("remove apenas o componente que satisfaz o predicado", () => {
		const c1: Component = { type: "condition", conditionType: "burning", duration: { kind: "this_turn" } };
		const c2: Component = { type: "condition", conditionType: "frozen", duration: { kind: "this_turn" } };
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", [health, c1, c2]));

		w = removeComponent(w, "e1", (c) => c.type === "condition" && (c as typeof c1).conditionType === "burning");
		const conditions = getComponents(w, "e1", "condition");
		expect(conditions).toHaveLength(1);
		expect((conditions[0] as typeof c2).conditionType).toBe("frozen");
		expect(hasComponent(w, "e1", "health")).toBe(true);
	});
});

describe("updateComponent", () => {
	it("atualiza o componente sem afetar os outros", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("e1", "hero", [health, { type: "dice", count: 3 }]));
		w = updateComponent<HealthComponent>(w, "e1", "health", (h) => ({ ...h, current: 5 }));

		expect(getComponent<HealthComponent>(w, "e1", "health")?.current).toBe(5);
		expect(getComponent(w, "e1", "dice")).toBeDefined();
	});
});

describe("imutabilidade", () => {
	it("addComponent retorna novo World sem mutar o anterior", () => {
		const w0 = createEmptyWorld();
		const w1 = upsertEntity(w0, createEntity("e1", "hero", []));
		const w2 = addComponent(w1, "e1", health);

		expect(w2).not.toBe(w1);
		expect(w1.entities["e1"]?.components).toHaveLength(0);
		expect(w2.entities["e1"]?.components).toHaveLength(1);
	});
});

describe("query / queryWithComponent", () => {
	it("query retorna entidades que satisfazem o predicado", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("h1", "hero", [health]));
		w = upsertEntity(w, createEntity("e1", "enemy", [health]));

		const heroes = query(w, (e) => e.type === "hero");
		expect(heroes).toHaveLength(1);
		expect(heroes[0]?.id).toBe("h1");
	});

	it("queryWithComponent retorna pares entidade+componente", () => {
		let w = createEmptyWorld();
		w = upsertEntity(w, createEntity("h1", "hero", [health]));
		w = upsertEntity(w, createEntity("e1", "enemy", []));

		const results = queryWithComponent<HealthComponent>(w, "health");
		expect(results).toHaveLength(1);
		expect(results[0]?.entity.id).toBe("h1");
		expect(results[0]?.component.current).toBe(10);
	});
});

import { describe, expect, it } from "vitest";
import { queryActiveModifiers } from "../modifierSystem";
import { createEmptyWorld, addComponent, createEntity, upsertEntity } from "../../ecs/world";
import type { ModifierComponent } from "../../ecs/types";

function makeModifier(
	target: ModifierComponent["target"],
	override: Partial<ModifierComponent> = {},
): ModifierComponent {
	return {
		type: "modifier",
		target,
		operation: "add",
		value: 2,
		source: "test_source",
		duration: { kind: "this_combat" },
		...override,
	};
}

// ── queryActiveModifiers ──────────────────────────────────────────────────────

describe("queryActiveModifiers", () => {
	it("retorna array vazio quando world está vazio", () => {
		const world = createEmptyWorld();
		const result = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(result).toHaveLength(0);
	});

	it("retorna array vazio quando entidade não tem modificadores", () => {
		const world = upsertEntity(createEmptyWorld(), createEntity("h1", "hero"));
		const result = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(result).toHaveLength(0);
	});

	it("retorna modificadores ativos do alvo com o target correto", () => {
		let world = upsertEntity(createEmptyWorld(), createEntity("h1", "hero"));
		world = addComponent(world, "h1", makeModifier("damage_dealt"));
		const result = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(result).toHaveLength(1);
		expect(result[0]!.target).toBe("damage_dealt");
	});

	it("filtra por modifierTarget — não retorna outros targets", () => {
		// Usar entidades separadas para cada target (queryWithComponent retorna
		// apenas o primeiro componente de um tipo por entidade)
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("h1", "hero"));
		world = upsertEntity(world, createEntity("h2", "hero"));
		world = addComponent(world, "h1", makeModifier("damage_dealt"));
		world = addComponent(world, "h2", makeModifier("damage_taken"));

		const dealMods = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(dealMods).toHaveLength(1);
		expect(dealMods[0]!.target).toBe("damage_dealt");

		// h1 tem "damage_dealt", não "damage_taken"
		const takeMods = queryActiveModifiers(world, "h1", "damage_taken");
		expect(takeMods).toHaveLength(0);
	});

	it("filtra por entityId — não retorna modificadores de outra entidade", () => {
		let world = createEmptyWorld();
		world = upsertEntity(world, createEntity("h1", "hero"));
		world = upsertEntity(world, createEntity("h2", "hero"));
		world = addComponent(world, "h1", makeModifier("damage_dealt", { value: 3 }));
		world = addComponent(world, "h2", makeModifier("damage_dealt", { value: 5 }));

		const h1Mods = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(h1Mods).toHaveLength(1);
		expect(h1Mods[0]!.value).toBe(3);
	});

	it("retorna o valor correto do modificador encontrado", () => {
		// queryWithComponent retorna o primeiro componente do tipo por entidade.
		// Para múltiplos modificadores empilháveis, o Passo 7 introduzirá
		// getComponents no loop de resolução de eventos.
		let world = upsertEntity(createEmptyWorld(), createEntity("h1", "hero"));
		world = addComponent(world, "h1", makeModifier("damage_dealt", { value: 7 }));
		const result = queryActiveModifiers(world, "h1", "damage_dealt");
		expect(result).toHaveLength(1);
		expect(result[0]!.value).toBe(7);
	});
});

// World: repositório de entidades do ECS.
// Todas as operações são imutáveis — sempre retornam um novo World.

import type {
	Component,
	ComponentType,
	Duration,
	Entity,
	EntityId,
	EntityType,
	ModifierComponent,
} from "./types";

export interface World {
	readonly entities: Readonly<Record<EntityId, Entity>>;
}

export function createEmptyWorld(): World {
	return { entities: {} };
}

export function createEntity(
	id: EntityId,
	type: EntityType,
	components: readonly Component[] = [],
): Entity {
	return { id, type, components };
}

export function upsertEntity(world: World, entity: Entity): World {
	return { entities: { ...world.entities, [entity.id]: entity } };
}

export function removeEntity(world: World, entityId: EntityId): World {
	const { [entityId]: _removed, ...rest } = world.entities;
	return { entities: rest };
}

export function getComponent<T extends Component>(
	world: World,
	entityId: EntityId,
	type: T["type"],
): T | undefined {
	const entity = world.entities[entityId];
	if (!entity) return undefined;
	return entity.components.find((c): c is T => c.type === type);
}

export function getComponents<T extends Component>(
	world: World,
	entityId: EntityId,
	type: T["type"],
): readonly T[] {
	const entity = world.entities[entityId];
	if (!entity) return [];
	return entity.components.filter((c): c is T => c.type === type);
}

export function hasComponent(
	world: World,
	entityId: EntityId,
	type: ComponentType,
): boolean {
	const entity = world.entities[entityId];
	if (!entity) return false;
	return entity.components.some((c) => c.type === type);
}

export function addComponent(
	world: World,
	entityId: EntityId,
	component: Component,
): World {
	const entity = world.entities[entityId];
	if (!entity) return world;
	const updated: Entity = {
		...entity,
		components: [...entity.components, component],
	};
	return { entities: { ...world.entities, [entityId]: updated } };
}

export function removeComponent(
	world: World,
	entityId: EntityId,
	predicate: (c: Component) => boolean,
): World {
	const entity = world.entities[entityId];
	if (!entity) return world;
	const updated: Entity = {
		...entity,
		components: entity.components.filter((c) => !predicate(c)),
	};
	return { entities: { ...world.entities, [entityId]: updated } };
}

export function updateComponent<T extends Component>(
	world: World,
	entityId: EntityId,
	type: T["type"],
	updater: (c: T) => T,
): World {
	const entity = world.entities[entityId];
	if (!entity) return world;
	const updated: Entity = {
		...entity,
		components: entity.components.map((c) =>
			c.type === type ? updater(c as T) : c,
		),
	};
	return { entities: { ...world.entities, [entityId]: updated } };
}

export function query(
	world: World,
	predicate: (e: Entity) => boolean,
): readonly Entity[] {
	return Object.values(world.entities).filter(predicate);
}

export function queryWithComponent<T extends Component>(
	world: World,
	type: T["type"],
): readonly { entity: Entity; component: T }[] {
	const results: { entity: Entity; component: T }[] = [];
	for (const entity of Object.values(world.entities)) {
		const component = entity.components.find((c): c is T => c.type === type);
		if (component) results.push({ entity, component });
	}
	return results;
}

// ── Modifier helpers ──────────────────────────────────────────────────────────

export function getModifierTotal(
	world: World,
	entityId: EntityId,
	target: ModifierComponent["target"],
): number {
	const entity = world.entities[entityId];
	if (!entity) return 0;
	const mods = entity.components.filter(
		(c): c is ModifierComponent => c.type === "modifier" && c.target === target,
	);
	if (mods.length === 0) return 0;

	// Processa em ordem: add/multiply acumulam; set (último vence); clamp aplica min/max.
	let total = 0;
	let setOverride: number | undefined;
	let clampMin: number | undefined;
	let clampMax: number | undefined;

	for (const mod of mods) {
		switch (mod.operation) {
			case "add":
				total += mod.value;
				break;
			case "multiply":
				total *= mod.value;
				break;
			case "set":
				setOverride = mod.value;
				break;
			case "clamp":
				// value positivo = max; value negativo = min
				if (mod.value >= 0) clampMax = mod.value;
				else clampMin = mod.value;
				break;
		}
	}

	let result = setOverride !== undefined ? setOverride : total;
	if (clampMin !== undefined) result = Math.max(clampMin, result);
	if (clampMax !== undefined) result = Math.min(clampMax, result);
	return result;
}

// Durations que expiram por scope
function durationExpiresAt(
	d: Duration,
	scope: "end_of_round" | "end_of_combat" | "once_consumed",
): boolean {
	switch (scope) {
		case "end_of_round":
			return d.kind === "this_turn";
		case "end_of_combat":
			return d.kind === "this_combat";
		case "once_consumed":
			return d.kind === "once";
	}
}

export function tickModifierDurations(
	world: World,
	scope: "end_of_round" | "end_of_combat" | "once_consumed",
): World {
	let updated = world;
	for (const entity of Object.values(world.entities)) {
		const toRemove = entity.components.filter(
			(c): c is ModifierComponent =>
				c.type === "modifier" && durationExpiresAt(c.duration, scope),
		);
		if (toRemove.length === 0) continue;
		updated = removeComponent(
			updated,
			entity.id,
			(c) =>
				c.type === "modifier" &&
				durationExpiresAt((c as ModifierComponent).duration, scope),
		);
	}
	return updated;
}

// Decrementa remaining de modifiers com duration.kind === "rounds".
// Modifiers com remaining === 1 são removidos (expiram após esta rodada).
// Chamado em fim de rodada junto com tickModifierDurations("end_of_round").
export function decrementRoundsModifiers(world: World): World {
	let updated = world;
	for (const entity of Object.values(world.entities)) {
		const hasRounds = entity.components.some(
			(c): c is ModifierComponent =>
				c.type === "modifier" && c.duration.kind === "rounds",
		);
		if (!hasRounds) continue;
		const newComponents = entity.components.flatMap<Component>((c) => {
			if (c.type !== "modifier") return [c];
			const mod = c as ModifierComponent;
			if (mod.duration.kind !== "rounds") return [c];
			if (mod.duration.remaining <= 1) return []; // expira
			return [
				{
					...mod,
					duration: {
						kind: "rounds" as const,
						remaining: mod.duration.remaining - 1,
					},
				},
			];
		});
		updated = upsertEntity(updated, { ...entity, components: newComponents });
	}
	return updated;
}

// Remove todos os modifiers cujo sourceEntityId aponta para uma entidade removida.
// Chamado após removeEntity em damageSystem para limpar while_source_in_play órfãos.
export function removeModifiersForSource(
	world: World,
	sourceEntityId: EntityId,
): World {
	let updated = world;
	for (const entity of Object.values(world.entities)) {
		const hasMod = entity.components.some(
			(c) =>
				c.type === "modifier" &&
				(c as ModifierComponent).duration.kind === "while_source_in_play" &&
				(c as ModifierComponent).sourceEntityId === sourceEntityId,
		);
		if (!hasMod) continue;
		updated = removeComponent(updated, entity.id, (c) => {
			if (c.type !== "modifier") return false;
			const mod = c as ModifierComponent;
			return (
				mod.duration.kind === "while_source_in_play" &&
				mod.sourceEntityId === sourceEntityId
			);
		});
	}
	return updated;
}

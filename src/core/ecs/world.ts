// World: repositório de entidades do ECS.
// Todas as operações são imutáveis — sempre retornam um novo World.

import type {
	Component,
	ComponentType,
	Entity,
	EntityId,
	EntityType,
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

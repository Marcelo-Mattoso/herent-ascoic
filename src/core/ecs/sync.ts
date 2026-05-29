// Helpers de sincronização: reconstrói entidades no World a partir dos shapes legados.
// Necessário enquanto a transição ECS está em andamento (Passos 5-6).
// Quando todos os handlers migrarem para sistemas, estes helpers são removidos.

import type { EnemyState } from "../state/enemyState";
import type { HeroState, ItemSlotType } from "../state/heroState";
import type { Component } from "./types";
import type { World } from "./world";
import { createEntity, upsertEntity } from "./world";

// Tipos de componentes gerenciados dinamicamente (adicionados por skills/efeitos).
// Esses componentes NÃO são derivados do shape legado — devem ser preservados
// quando o sync reconstrói a entidade a partir de HeroState/EnemyState.
const DYNAMIC_COMPONENT_TYPES = new Set<string>(["trigger", "modifier"]);

export function syncEntityFromHero(world: World, hero: HeroState): World {
	const components: Component[] = [
		{
			type: "health",
			current: hero.currentLife,
			max: hero.maxLife,
			healBlocked: hero.healBlocked ?? false,
		},
		{ type: "damage_stat", damage: hero.damage, hitBonus: hero.hitBonus },
		{ type: "dice", count: hero.dice },
		{ type: "impeto", level: hero.impeto },
	];

	for (const [slot, itemName] of Object.entries(hero.activeItems)) {
		if (itemName) {
			components.push({
				type: "item_equipped",
				itemName,
				slot: slot as ItemSlotType,
			});
		}
	}

	if (hero.backpack.length > 0) {
		components.push({ type: "item_backpack", items: hero.backpack });
	}

	for (const conditionType of hero.conditions) {
		components.push({
			type: "condition",
			conditionType,
			duration: { kind: "this_combat" },
		});
	}

	// Preservar componentes dinâmicos já presentes (TriggerComponents, Modifiers).
	const existing = world.entities[hero.id];
	if (existing) {
		for (const c of existing.components) {
			if (DYNAMIC_COMPONENT_TYPES.has(c.type)) components.push(c);
		}
	}

	return upsertEntity(world, createEntity(hero.id, "hero", components));
}

export function syncEntityFromEnemy(world: World, enemy: EnemyState): World {
	const components: Component[] = [
		{
			type: "health",
			current: enemy.currentLife,
			max: enemy.maxLife,
			healBlocked: false,
		},
		{ type: "damage_stat", damage: enemy.damage, hitBonus: enemy.hitBonus },
		{ type: "dice", count: enemy.dice },
	];

	for (const conditionType of enemy.conditions) {
		components.push({
			type: "condition",
			conditionType,
			duration: { kind: "this_combat" },
		});
	}

	for (const [tokenType, count] of Object.entries(enemy.tokens)) {
		if (count > 0) {
			components.push({ type: "token", tokenType, count });
		}
	}

	// Preservar componentes dinâmicos já presentes (TriggerComponents, Modifiers).
	const existing = world.entities[enemy.id];
	if (existing) {
		for (const c of existing.components) {
			if (DYNAMIC_COMPONENT_TYPES.has(c.type)) components.push(c);
		}
	}

	const entityType = enemy.isSubboss ? "subboss" : "enemy";
	return upsertEntity(world, createEntity(enemy.id, entityType, components));
}

export function syncHeroesAndEnemies(
	world: World,
	heroes: readonly HeroState[],
	enemies: readonly EnemyState[],
): World {
	let w = world;
	for (const hero of heroes) w = syncEntityFromHero(w, hero);
	for (const enemy of enemies) w = syncEntityFromEnemy(w, enemy);
	return w;
}

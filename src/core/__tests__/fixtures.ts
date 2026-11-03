import type { EntityType } from "../ecs/types";
import { createEntity, upsertEntity, type World } from "../ecs/world";
import type {
	EnemyRecord,
	EnemyState,
} from "../state/enemyState";
import type { HeroRecord, HeroState } from "../state/heroState";
import type { AscensaoGame, GameState } from "../state/gameState";
import type { GameState as EngineGameState } from "../../engine/state";
import {
	recordOfEnemy,
	recordOfHero,
	spawnEnemy,
	spawnHero,
} from "../state/access";
import { gameOf } from "../../engine/state";

type UnitLists =
	| "heroes"
	| "defeatedHeroes"
	| "fledHeroes"
	| "activeEnemies"
	| "enemyGraveyard";

export type LooseGame = Omit<AscensaoGame, UnitLists> & {
	readonly heroes: readonly (HeroRecord | HeroState)[];
	readonly defeatedHeroes: readonly (HeroRecord | HeroState)[];
	readonly fledHeroes: readonly (HeroRecord | HeroState)[];
	readonly activeEnemies: readonly (EnemyRecord | EnemyState)[];
	readonly enemyGraveyard: readonly (EnemyRecord | EnemyState)[];
};

export type LooseState = EngineGameState<LooseGame>;

function hasStats(unit: object): boolean {
	return "currentLife" in unit;
}

export function settled(state: LooseState): GameState {
	const game = gameOf(state);
	let world = game.world;
	const heroes = (list: readonly (HeroRecord | HeroState)[]) =>
		list.map((hero) => {
			if (!hasStats(hero)) return hero as HeroRecord;
			world = spawnHero(world, hero as HeroState);
			return recordOfHero(hero as HeroState);
		});
	const enemies = (list: readonly (EnemyRecord | EnemyState)[]) =>
		list.map((enemy) => {
			if (!hasStats(enemy)) return enemy as EnemyRecord;
			world = spawnEnemy(world, enemy as EnemyState);
			return recordOfEnemy(enemy as EnemyState);
		});
	const settledGame: AscensaoGame = {
		...game,
		heroes: heroes(game.heroes),
		defeatedHeroes: heroes(game.defeatedHeroes),
		fledHeroes: heroes(game.fledHeroes),
		activeEnemies: enemies(game.activeEnemies),
		enemyGraveyard: enemies(game.enemyGraveyard),
		world,
	};
	return { engine: state.engine, game: settledGame };
}

export function settledWith(
	base: GameState,
	game: Partial<LooseGame>,
): GameState {
	return settled({ engine: base.engine, game: { ...gameOf(base), ...game } });
}

export function ensureEntity(
	world: World,
	id: string,
	type: EntityType,
): World {
	return world.entities[id] ? world : upsertEntity(world, createEntity(id, type));
}

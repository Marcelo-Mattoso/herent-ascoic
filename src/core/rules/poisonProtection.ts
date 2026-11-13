import type { GameState } from "../state/gameState";
import { enemiesOf, heroesOf } from "../state/access";
import { gameOf, withGame } from "../../engine/state";

/** O Coração protege o grupo dos ticks de veneno durante o combate com a Grande Bruxa. */
export function corruptedHeartPoisonReduction(state: GameState, targetId: string): number {
	if (!heroesOf(state).some((hero) => hero.id === targetId && hero.status === "active"))
		return 0;
	if (!gameOf(state).groupArtifacts.some((artifact) => artifact.cardId === "artifact_corrupted_forest_heart"))
		return 0;
	return enemiesOf(state).some((enemy) =>
		enemy.id === "boss" && enemy.cardId === "boss_great_cauldron_witch" &&
		enemy.status === "active") ? 1 : 0;
}

/** Soma a proteção REAL, depois dos outros redutores de veneno. */
export function recordCorruptedHeartPrevention(state: GameState, prevented: number): GameState {
	if (prevented <= 0) return state;
	return withGame(state, (game) => ({
		...game,
		poisonTelemetry: {
			toHeroes: game.poisonTelemetry?.toHeroes ?? 0,
			toEnemies: game.poisonTelemetry?.toEnemies ?? 0,
			preventedByHeart: (game.poisonTelemetry?.preventedByHeart ?? 0) + prevented,
		},
	}));
}

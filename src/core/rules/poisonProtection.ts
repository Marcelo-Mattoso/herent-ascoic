import type { GameState } from "../state/gameState";
import { enemiesOf, heroesOf } from "../state/access";
import { gameOf } from "../../engine/state";
import { recordPoisonPrevention } from "./poisonTelemetry";
import { WITCH_CONTENT_IDS } from "../../data/witchContentIds";

/** O Coração protege o grupo dos ticks de veneno durante o combate com a Grande Bruxa. */
export function corruptedHeartPoisonReduction(state: GameState, targetId: string): number {
	if (!heroesOf(state).some((hero) => hero.id === targetId && hero.status === "active"))
		return 0;
	if (!gameOf(state).groupArtifacts.some((artifact) => artifact.cardId === WITCH_CONTENT_IDS.corruptedForestHeart))
		return 0;
	return enemiesOf(state).some((enemy) =>
		enemy.id === "boss" && enemy.cardId === WITCH_CONTENT_IDS.boss &&
		enemy.status === "active") ? 1 : 0;
}

/** Registra oportunidade (com ou sem Coração) e prevenção após outras reduções. */
export function recordCorruptedHeartPrevention(state: GameState, prevented: number, targetId: string): GameState {
	const game = gameOf(state);
	const witchBossActive = heroesOf(state).some((hero) => hero.id === targetId && hero.status === "active") &&
		enemiesOf(state).some((enemy) =>
		enemy.id === "boss" && enemy.cardId === WITCH_CONTENT_IDS.boss && enemy.status === "active");
	const heartHeld = witchBossActive && game.groupArtifacts.some((a) =>
		a.cardId === WITCH_CONTENT_IDS.corruptedForestHeart) &&
		heroesOf(state).some((hero) => hero.id === targetId && hero.status === "active");
	return recordPoisonPrevention(state, prevented, witchBossActive, heartHeld);
}

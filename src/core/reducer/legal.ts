import type { Action } from "../actions/types";
import { gameOf } from "../../engine/state";
import type { GameState } from "../state/gameState";

export function partyHeroIds(state: GameState): string[] {
	const heroes = gameOf(state).heroes.filter((h) => h.status === "active");
	return (heroes.length > 0 ? heroes : gameOf(state).heroes).map((h) => h.id);
}

export function activeEnemies(state: GameState) {
	return gameOf(state).activeEnemies.filter((e) => e.status === "active");
}

export function targetPairs(state: GameState): Action[] {
	const out: Action[] = [];
	for (const heroId of partyHeroIds(state)) {
		for (const enemy of activeEnemies(state)) {
			out.push({
				type: "CHOOSE_TARGET",
				payload: { heroId, enemyId: enemy.id },
			});
		}
	}
	return out;
}

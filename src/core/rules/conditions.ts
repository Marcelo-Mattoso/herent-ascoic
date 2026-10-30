import type { GameState } from "../state/gameState";
import { cardById } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { gameOf } from "../../engine/state";

type AccessCondition =
	| { type: "group_artifacts_gte"; value: number }
	| { type: "always" };

function evaluateCondition(
	condition: AccessCondition,
	state: GameState,
): boolean {
	switch (condition.type) {
		case "group_artifacts_gte":
			return gameOf(state).groupArtifacts.length >= condition.value;
		case "always":
			return true;
		default:
			return false;
	}
}

export function checkBossCondition(engine: GameEngine, 
	state: GameState,
	bossCardId: string,
): boolean {
	const card = cardById(engine, bossCardId);
	if (!card || card.type !== "boss") return false;

	const raw = (card as unknown as Record<string, unknown>).accessCondition;
	if (!raw || typeof raw !== "object") return false;

	return evaluateCondition(raw as AccessCondition, state);
}

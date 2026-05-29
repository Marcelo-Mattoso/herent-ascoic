// Verificação de condição de acesso ao boss.
// A condição é declarada no campo accessCondition da carta do boss em cards.json.

import { getCardById } from "../data/cards";
import type { GameState } from "../state/gameState";

type AccessCondition =
	| { type: "group_artifacts_gte"; value: number }
	| { type: "always" };

function evaluateCondition(
	condition: AccessCondition,
	state: GameState,
): boolean {
	switch (condition.type) {
		case "group_artifacts_gte":
			return state.groupArtifacts.length >= condition.value;
		case "always":
			return true;
		default:
			return false;
	}
}

export function checkBossCondition(
	state: GameState,
	bossCardId: string,
): boolean {
	const card = getCardById(bossCardId);
	if (!card || card.type !== "boss") return false;

	const raw = (card as unknown as Record<string, unknown>).accessCondition;
	if (!raw || typeof raw !== "object") return false;

	return evaluateCondition(raw as AccessCondition, state);
}

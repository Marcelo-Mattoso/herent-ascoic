import type { PendingSkillChoice } from "../choices";
import type { GameState } from "../state/gameState";
import { cardById, skillOwners } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { deckOf, pendingSkillChoiceOf } from "../state/access";
import { gameOf } from "../../engine/state";
type PendingChoice = PendingSkillChoice;
type ChoiceOption = PendingChoice["options"][number];

// Para escolhas da dungeon, card_0/card_1 são IDs de decisão. O rótulo
// contém o ID real, validado contra o trecho do baralho que o efeito revelou.
export function choiceCardId(engine: GameEngine,
	state: GameState,
	pending: PendingChoice,
	option: ChoiceOption,
): string | null {
	if (cardById(engine, option.id)) return option.id;
	const match = /^card_(\d+)$/.exec(option.id);
	if (!match) return null;
	const index = Number(match[1]);
	const revealedCount = pending.options.filter((candidate) =>
		/^card_\d+$/.test(candidate.id),
	).length;
	return index < revealedCount &&
		deckOf(state, "dungeonDeck").available[index] === option.label &&
		cardById(engine, option.label)
		? option.label
		: null;
}

export function choiceSourceCardId(engine: GameEngine,
	state: GameState,
	pending: PendingChoice,
): string | null {
	if (pending.sourceCardId && cardById(engine, pending.sourceCardId))
		return pending.sourceCardId;
	const owners = new Set(skillOwners(engine, pending.skillId));
	const candidates = new Set<string>();
	if (gameOf(state).currentRoom && owners.has(gameOf(state).currentRoom!.cardId))
		candidates.add(gameOf(state).currentRoom!.cardId);
	const enemy = gameOf(state).activeEnemies.find(
		(candidate) => candidate.id === pending.sourceEnemyId,
	);
	if (enemy && owners.has(enemy.cardId)) candidates.add(enemy.cardId);
	const hero = gameOf(state).heroes.find(
		(candidate) => candidate.id === pending.sourceHeroId,
	);
	if (hero) {
		for (const cardId of [
			hero.cardId,
			...Object.values(hero.activeItems),
			...hero.backpack,
		]) {
			if (cardId && owners.has(cardId)) candidates.add(cardId);
		}
	}
	return candidates.size === 1 ? [...candidates][0] : null;
}

export function projectSkillChoice(engine: GameEngine, state: GameState) {
	const pending = pendingSkillChoiceOf(state);
	if (!pending) return null;
	return {
		...pending,
		resolvedSourceCardId: choiceSourceCardId(engine, state, pending),
		options: pending.options.map((option) => ({
			...option,
			cardId: choiceCardId(engine, state, pending, option),
		})),
	};
}

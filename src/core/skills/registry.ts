// Registro de continuações de habilidades (pós-Patch-16).
// O registry de handlers legados foi removido — todas as skills usam DSL (effect) ou script.
// Apenas registerContinuation/getContinuation permanecem para o fluxo SKILL_CHOICE.

import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";

export type SkillContinuation = (
	state: GameState,
	ctx: SkillContext,
	choice: string,
) => GameState;

const _continuations = new Map<string, SkillContinuation>();

export function registerContinuation(
	type: string,
	fn: SkillContinuation,
): void {
	_continuations.set(type, fn);
}

export function getContinuation(type: string): SkillContinuation | undefined {
	return _continuations.get(type);
}

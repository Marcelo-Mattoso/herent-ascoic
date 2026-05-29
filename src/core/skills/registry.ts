// Registro de handlers de habilidades.
// Cada handler é uma função pura: (state, ctx, value) → state.

import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";

export type SkillHandler = (
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
) => GameState;

// Continuação de skill após SKILL_CHOICE: recebe o estado limpo (sem pendingSkillChoice) e a escolha.
export type SkillContinuation = (
	state: GameState,
	ctx: SkillContext,
	choice: string,
) => GameState;

const _registry = new Map<string, SkillHandler>();
const _continuations = new Map<string, SkillContinuation>();
const _warnedMissing = new Set<string>();

export function register(type: string, handler: SkillHandler): void {
	_registry.set(type, handler);
}

export function registerContinuation(
	type: string,
	fn: SkillContinuation,
): void {
	_continuations.set(type, fn);
}

export function getHandler(type: string): SkillHandler | null {
	const h = _registry.get(type);
	if (!h) {
		if (!_warnedMissing.has(type)) {
			console.warn(`[SKILL NÃO IMPLEMENTADA: ${type}]`);
			_warnedMissing.add(type);
		}
		return null;
	}
	return h;
}

export function getContinuation(type: string): SkillContinuation | undefined {
	return _continuations.get(type);
}

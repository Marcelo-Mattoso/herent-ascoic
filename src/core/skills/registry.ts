// Registro de handlers de habilidades.
// Cada handler é uma função pura: (state, ctx, value) → state.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../state/gameState";

export type SkillHandler = (
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
) => GameState;

const _registry = new Map<string, SkillHandler>();
const _warnedMissing = new Set<string>();

export function register(type: string, handler: SkillHandler): void {
	_registry.set(type, handler);
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

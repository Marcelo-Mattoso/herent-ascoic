// Compatibilidade para o dispatch legado.
// A resolução real vive em core/triggers/engine.ts.

import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";
import {
	fireTrigger as fireTriggerFromEngine,
	guardPassed,
	isSkillGuardConsumed,
} from "../triggers/engine";
import type { EventName } from "./dsl/types";

/** @deprecated Legado — usava trigger string. Mantido para compat de testes. */
export function parseTrigger(_trigger: string): {
	guard: string | null;
	base: string;
} {
	return { guard: null, base: _trigger };
}

export { guardPassed, isSkillGuardConsumed };

export function fireTrigger(
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): GameState {
	return fireTriggerFromEngine(state, event, ctx);
}

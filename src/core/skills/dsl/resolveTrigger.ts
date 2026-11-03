import type { GameState } from "../../state/gameState";
import { resolveCondition } from "./resolveCondition";
import type { EvalCtx, LimitKind, TriggerObject } from "./types";
import { gameOf, withGame } from "../../../engine/state";
import { scopedFlagOf, withScopedFlag } from "../../state/access";

/**
 * Decide se uma habilidade dispara dado seu TriggerObject e o contexto atual.
 *
 * Ordem de verificação:
 * 1. `limit` — guard de cardinalidade (sem efeito colateral).
 * 2. `when`  — condição pura via resolveCondition.
 *
 * Retorna `true` se ambos passam (ou estão ausentes).
 */
export function resolveTrigger(trigger: TriggerObject, ctx: EvalCtx): boolean {
	if (
		trigger.limit &&
		!limitPassed(trigger.limit, ctx.skillId, ctx.sourceId, ctx.state)
	) {
		return false;
	}
	if (trigger.when && !resolveCondition(trigger.when, ctx)) {
		return false;
	}
	return true;
}

/**
 * Verifica se o guard de cardinalidade ainda permite disparar.
 * Consulta `state.oncePer` / `state.combat.oncePer` conforme escopo.
 */
function limitPassed(
	limit: LimitKind,
	skillId: string,
	sourceId: string | null,
	state: GameState,
): boolean {
	const key = sourceId ? `${skillId}::${sourceId}` : skillId;

	switch (limit) {
		case "once_per_game":
			return !gameOf(state).oncePer.game[key];
		case "once_per_room":
			return !scopedFlagOf(state, "room", "oncePer", key);
		case "once_per_combat":
			return !scopedFlagOf(state, "combat", "oncePer", key);
		case "once_per_round":
			return !scopedFlagOf(state, "round", "oncePer", key);
	}
}

/**
 * Marca o limit como usado — muta via cópia imutável.
 * Chamado pelo dispatcher APÓS confirmar que a habilidade dispara.
 */
export function markLimitUsed(
	trigger: TriggerObject,
	skillId: string,
	sourceId: string | null,
	state: GameState,
): GameState {
	if (!trigger.limit) return state;

	const key = sourceId ? `${skillId}::${sourceId}` : skillId;

	switch (trigger.limit) {
		case "once_per_game":
			return withGame(state, (prevGame) => ({ ...prevGame, oncePer: {
					...gameOf(state).oncePer,
					game: { ...gameOf(state).oncePer.game, [key]: true },
				} }));
		case "once_per_room":
			return withScopedFlag(state, "room", "oncePer", key);
		case "once_per_combat":
			if (!gameOf(state).combat) return state;
			return withScopedFlag(state, "combat", "oncePer", key);
		case "once_per_round":
			if (!gameOf(state).combat) return state;
			return withScopedFlag(state, "round", "oncePer", key);
	}
}

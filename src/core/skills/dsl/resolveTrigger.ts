// Resolução de TriggerObject → boolean (a habilidade pode disparar?).
// Pura — não muta estado. Cabe ao dispatcher chamar markLimitUsed após decidir disparar.

import type { GameState } from "../../state/gameState";
import { resolveCondition } from "./resolveCondition";
import type { EvalCtx, LimitKind, TriggerObject } from "./types";

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
			return !state.oncePer.game[key];
		case "once_per_room":
			return !state.combat?.oncePer.room[key];
		case "once_per_combat":
			return !state.combat?.oncePer.combat[key];
		case "once_per_round":
			return !state.combat?.oncePer.round[key];
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
			return {
				...state,
				oncePer: {
					...state.oncePer,
					game: { ...state.oncePer.game, [key]: true },
				},
			};
		case "once_per_room":
			if (!state.combat) return state;
			return {
				...state,
				combat: {
					...state.combat,
					oncePer: {
						...state.combat.oncePer,
						room: { ...state.combat.oncePer.room, [key]: true },
					},
				},
			};
		case "once_per_combat":
			if (!state.combat) return state;
			return {
				...state,
				combat: {
					...state.combat,
					oncePer: {
						...state.combat.oncePer,
						combat: { ...state.combat.oncePer.combat, [key]: true },
					},
				},
			};
		case "once_per_round":
			if (!state.combat) return state;
			return {
				...state,
				combat: {
					...state.combat,
					oncePer: {
						...state.combat.oncePer,
						round: { ...state.combat.oncePer.round, [key]: true },
					},
				},
			};
	}
}

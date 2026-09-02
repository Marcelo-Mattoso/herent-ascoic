// Resolvedor de efeitos declarativos para o event bus.
// Interpreta EffectDescriptor e aplica o efeito correspondente.
// Passo 7: accumulator effects (modify_damage_amount, modify_heal_amount).
// Passo 8: push_to_stack — adia efeito para drenagem posterior (sem recursão direta).
// Patch-18 Lote F: run_skill — executa efeito de skill via DSL/script.

import { SKILLS } from "../data/skills";
import type { SkillContext } from "../data/skillTypes";
import type { EffectDescriptor, EntityId } from "../ecs/types";
import { addPending } from "../effects/stack";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import { evaluate } from "../skills/dsl/evaluate";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import type { EventName } from "../skills/dsl/types";
import type { GameState } from "../state/gameState";
import {
	collectPromptTriggers,
	createPendingTriggerInterrupt,
	triggerDecisionFlag,
} from "../triggers/engine";
import type { GameEvent } from "./types";

function skillContextFromEvent(
	state: GameState,
	event: GameEvent,
	entityId: EntityId,
	skillId: string,
	params: Record<string, unknown>,
): SkillContext {
	const entityIsHero = state.heroes.some((h) => h.id === entityId);
	const entityIsEnemy = state.activeEnemies.some((e) => e.id === entityId);
	const payload = event.payload as Record<string, unknown>;

	let eventHeroId: string | undefined;
	let eventEnemyId: string | undefined;
	if (event.type === "DamageDealt" || event.type === "DamageAboutToBeDealt") {
		const dmgSource = payload["sourceId"] as string | undefined;
		const dmgTarget = payload["targetId"] as string | undefined;
		const otherParty = entityId === dmgTarget ? dmgSource : dmgTarget;
		if (otherParty) {
			if (state.heroes.some((h) => h.id === otherParty)) {
				eventHeroId = otherParty;
			} else {
				eventEnemyId = otherParty;
			}
		}
	} else {
		eventHeroId = (payload["heroId"] ?? payload["targetId"]) as
			| string
			| undefined;
		eventEnemyId = (payload["enemyId"] ?? payload["sourceId"]) as
			| string
			| undefined;
	}

	return {
		triggeredBy: event.type,
		sourceHeroId: entityIsHero ? entityId : undefined,
		sourceEnemyId: entityIsEnemy ? entityId : undefined,
		targetHeroIds: eventHeroId && !entityIsHero ? [eventHeroId] : [],
		targetEnemyIds: eventEnemyId && !entityIsEnemy ? [eventEnemyId] : [],
		skillId,
		value: (params["value"] ?? null) as number | string | null,
		round:
			typeof payload["round"] === "number"
				? payload["round"]
				: (state.combat?.round ?? undefined),
	};
}

export function applyEffect(
	state: GameState,
	event: GameEvent,
	entityId: EntityId,
	effect: EffectDescriptor,
): { state: GameState; event: GameEvent } {
	const effectType = effect["type"] as string | undefined;

	switch (effectType) {
		case "modify_damage_amount": {
			// Reduz (delta < 0) ou aumenta (delta > 0) o dano prestes a ser causado.
			// Só atua se o alvo do dano for esta entidade.
			if (event.type !== "DamageAboutToBeDealt") return { state, event };
			if (event.payload.targetId !== entityId) return { state, event };
			const delta = effect["delta"] as number;
			const minVal = (effect["min"] as number | undefined) ?? 0;
			const newAmount = Math.max(minVal, event.payload.amount + delta);
			return {
				state,
				event: {
					...event,
					payload: { ...event.payload, amount: newAmount },
				},
			};
		}

		case "modify_heal_amount": {
			// Modifica a quantidade de cura prestes a ser aplicada.
			if (event.type !== "HealAboutToBeApplied") return { state, event };
			if (event.payload.targetId !== entityId) return { state, event };
			const delta = effect["delta"] as number;
			const minVal = (effect["min"] as number | undefined) ?? 0;
			const newAmount = Math.max(minVal, event.payload.amount + delta);
			return {
				state,
				event: {
					...event,
					payload: { ...event.payload, amount: newAmount },
				},
			};
		}

		case "push_to_stack": {
			// Adia um efeito interno para a stack — não aplicado imediatamente.
			// Permite cadeias sem recursão direta: listener define O QUÊ, drainStack resolve QUANDO.
			//
			// targetFilter: "self" → só empurra se o evento é direcionado a esta entidade.
			// Sem targetFilter → empurra sempre (para eventos sem targetId).
			const targetFilter = effect["targetFilter"] as string | undefined;
			if (targetFilter === "self") {
				const payload = event.payload as { targetId?: string };
				if (payload.targetId !== entityId) return { state, event };
			}
			const cause = (effect["cause"] as string | undefined) ?? event.type;
			const innerEffect = effect["innerEffect"] as EffectDescriptor;
			const newStack = addPending(state.effectStack, {
				cause,
				effect: innerEffect,
				source: entityId,
			});
			return { state: { ...state, effectStack: newStack }, event };
		}

		case "queue_trigger_interrupt": {
			if (state.pendingTriggerInterrupt) return { state, event };

			const skillId = effect["skillId"] as string;
			const triggerEvent = effect["triggerEvent"] as EventName | undefined;
			const params = (effect["params"] as Record<string, unknown>) ?? {};
			if (!skillId || !triggerEvent) return { state, event };

			const skillCtx = skillContextFromEvent(
				state,
				event,
				entityId,
				skillId,
				params,
			);
			const candidate = collectPromptTriggers(state, triggerEvent, skillCtx).find(
				(c) =>
					c.definition.id === skillId &&
					(c.source.entityId ?? c.source.cardId) === entityId,
			);
			if (!candidate) return { state, event };

			const pending = createPendingTriggerInterrupt(candidate, skillCtx);
			if (state.flags[triggerDecisionFlag(pending.id)]) {
				return { state, event };
			}

			return {
				state: { ...state, pendingTriggerInterrupt: pending },
				event,
			};
		}

		// Lote F: run_skill — executa skill DSL/script em resposta a um evento do bus
		case "run_skill": {
			const skillId = effect["skillId"] as string;
			const params = (effect["params"] as Record<string, unknown>) ?? {};

			const def = SKILLS.abilities.find((a) => a.id === skillId);
			if (!def) return { state, event };

			const skillCtx = skillContextFromEvent(
				state,
				event,
				entityId,
				skillId,
				params,
			);

			const evalCtx = buildScriptCtx(state, skillCtx, params);

			// Checa def.conditions antes de avaliar — mesma semântica do path manual (dispatch.ts)
			if (def.conditions && def.conditions.length > 0) {
				const conditionsMet = def.conditions.every((c) =>
					resolveCondition(c, evalCtx),
				);
				if (!conditionsMet) return { state, event };
			}

			if (def.effect) {
				const newState = evaluate(def.effect, evalCtx);
				return { state: newState, event };
			}
			if (def.script) {
				const fn = getScript(`${def.script}.run`);
				if (fn) return { state: fn(evalCtx), event };
			}
			return { state, event };
		}

		default:
			// Efeitos não reconhecidos: ignorados. drainStack os capturaria e ignoraria também.
			return { state, event };
	}
}

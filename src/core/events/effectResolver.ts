import type { SkillContext } from "../data/skillTypes";
import type { EffectDescriptor, EntityId } from "../ecs/types";
import { addPending } from "../effects/stack";
import { buildScriptCtx } from "../scripts/context";
import { scriptOf } from "../gameEngine";
import { evaluate } from "../skills/dsl/evaluate";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import type { EventName } from "../skills/dsl/types";
import type { GameState } from "../state/gameState";
import {
	isAbilityPrepared,
	preparedAbilityKey,
	removePreparedAbility,
} from "../abilities/prepared";
import {
	collectPromptTriggers,
	executeTriggerCandidate,
} from "../triggers/engine";
import type { GameEventDraft } from "./types";
import { skillById, skillsOf } from "../gameEngine";
import { refRequirementMet } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { pendingTriggerInterruptOf, withEffectStack, effectStackOf } from "../state/access";
import { gameOf } from "../../engine/state";

/**
 * Defesa de última linha para componentes ECS persistidos/restaurados: a
 * instalação já filtra referências Roxas, mas um componente criado antes de
 * uma transição de Despertar não pode burlar a regra ao receber um evento.
 */
function sourceSkillIsAwakened(engine: GameEngine,
	state: GameState,
	entityId: EntityId,
	skillId: string,
): boolean {
	const cardId =
		gameOf(state).heroes.find((hero) => hero.id === entityId)?.cardId ??
		gameOf(state).activeEnemies.find((enemy) => enemy.id === entityId)?.cardId;
	if (!cardId) return true;
	const refs = skillsOf(engine, cardId).filter(({ def }) => def.id === skillId);
	if (refs.length === 0) return true;
	return refs.some(({ ref }) =>
		refRequirementMet(engine, state, ref.requiresAwakening),
	);
}

function skillContextFromEvent(
	state: GameState,
	event: GameEventDraft,
	entityId: EntityId,
	skillId: string,
	params: Record<string, unknown>,
): SkillContext {
	const entityIsHero = gameOf(state).heroes.some((h) => h.id === entityId);
	const entityIsEnemy = gameOf(state).activeEnemies.some((e) => e.id === entityId);
	const payload = event.payload as Record<string, unknown>;

	let eventHeroId: string | undefined;
	let eventEnemyId: string | undefined;
	if (event.type === "DamageDealt" || event.type === "DamageAboutToBeDealt") {
		const dmgSource = payload["sourceId"] as string | undefined;
		const dmgTarget = payload["targetId"] as string | undefined;
		const otherParty = entityId === dmgTarget ? dmgSource : dmgTarget;
		if (otherParty) {
			if (gameOf(state).heroes.some((h) => h.id === otherParty)) {
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
				: (gameOf(state).combat?.round ?? undefined),
	};
}

export function applyEffect(engine: GameEngine,
	state: GameState,
	event: GameEventDraft,
	entityId: EntityId,
	effect: EffectDescriptor,
): { state: GameState; event: GameEventDraft } {
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
			const newStack = addPending(effectStackOf(state), {
				cause,
				effect: innerEffect,
				source: entityId,
			});
			return { state: withEffectStack(state, newStack), event };
		}

		case "queue_trigger_interrupt": {
			if (pendingTriggerInterruptOf(state)) return { state, event };

			const skillId = effect["skillId"] as string;
			const triggerEvent = effect["triggerEvent"] as EventName | undefined;
			const params = (effect["params"] as Record<string, unknown>) ?? {};
			if (!skillId || !triggerEvent) return { state, event };
			if (!sourceSkillIsAwakened(engine, state, entityId, skillId))
				return { state, event };

			const skillCtx = skillContextFromEvent(
				state,
				event,
				entityId,
				skillId,
				params,
			);
			const candidate = collectPromptTriggers(engine,
				state,
				triggerEvent,
				skillCtx,
			).find(
				(c) =>
					c.definition.id === skillId &&
					(c.source.entityId ?? c.source.cardId) === entityId,
			);
			if (!candidate) return { state, event };

			const sourceHeroId = candidate.source.sourceHeroId;
			if (
				!sourceHeroId ||
				(candidate.source.kind !== "hero" &&
					candidate.source.kind !== "item" &&
					candidate.source.kind !== "artifact")
			)
				return { state, event };
			const key = preparedAbilityKey(
				candidate.source.kind,
				sourceHeroId,
				candidate.source.cardId,
				candidate.definition.id,
			);
			if (!isAbilityPrepared(state, key)) return { state, event };
			return {
				state: removePreparedAbility(
					executeTriggerCandidate(engine, state, candidate, skillCtx),
					key,
				),
				event,
			};
		}

		// Lote F: run_skill — executa skill DSL/script em resposta a um evento do bus
		case "run_skill": {
			const skillId = effect["skillId"] as string;
			const params = (effect["params"] as Record<string, unknown>) ?? {};

			const def = skillById(engine, skillId);
			if (!def) return { state, event };
			if (!sourceSkillIsAwakened(engine, state, entityId, skillId))
				return { state, event };

			const skillCtx = skillContextFromEvent(
				state,
				event,
				entityId,
				skillId,
				params,
			);

			const evalCtx = buildScriptCtx(engine, state, skillCtx, params);

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
				const fn = scriptOf(engine, `${def.script}.run`);
				if (fn) return { state: fn(evalCtx), event };
			}
			return { state, event };
		}

		default:
			// Efeitos não reconhecidos: ignorados. drainStack os capturaria e ignoraria também.
			return { state, event };
	}
}

// Resolvedor de efeitos declarativos para o event bus.
// Interpreta EffectDescriptor e aplica o efeito correspondente.
// Passo 7: accumulator effects (modify_damage_amount, modify_heal_amount).
// Passo 8: push_to_stack — adia efeito para drenagem posterior (sem recursão direta).
// Patch-18 Lote F: run_skill — executa efeito de skill via DSL/script.

import type { EffectDescriptor, EntityId } from "../ecs/types";
import { addPending } from "../effects/stack";
import type { SkillContext } from "../data/skillTypes";
import { SKILLS } from "../data/skills";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "../skills/dsl/evaluate";
import { getScript } from "../scripts/registry";
import type { GameState } from "../state/gameState";
import type { GameEvent } from "./types";

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

		// Lote F: run_skill — executa skill DSL/script em resposta a um evento do bus
		case "run_skill": {
			const skillId = effect["skillId"] as string;
			const params = (effect["params"] as Record<string, unknown>) ?? {};

			const def = SKILLS.abilities.find((a) => a.id === skillId);
			if (!def) return { state, event };

			// Resolve source e target a partir do entityId e do payload do evento
			const entityIsHero = state.heroes.some((h) => h.id === entityId);
			const entityIsEnemy = state.activeEnemies.some((e) => e.id === entityId);
			const payload = event.payload as Record<string, unknown>;

			// Para eventos de combate, heroId/enemyId no payload definem o contexto
			const eventHeroId = (payload["heroId"] ?? payload["targetId"]) as string | undefined;
			const eventEnemyId = (payload["enemyId"] ?? payload["sourceId"]) as string | undefined;

			const skillCtx: SkillContext = {
				triggeredBy: event.type,
				sourceHeroId: entityIsHero ? entityId : undefined,
				sourceEnemyId: entityIsEnemy ? entityId : undefined,
				targetHeroIds: eventHeroId && !entityIsHero ? [eventHeroId] : [],
				targetEnemyIds: eventEnemyId && !entityIsEnemy ? [eventEnemyId] : [],
				skillId,
				value: (params["value"] ?? null) as number | string | null,
			};

			const evalCtx = buildScriptCtx(state, skillCtx, params);

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

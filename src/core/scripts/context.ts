import type { SkillContext } from "../data/skillTypes";
import { log as appendLog } from "../reducer/utils";
import { resolveSkillForById } from "../skills/lookup";
import type { GameState } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import { addPending } from "../effects/stack";
import {
	addComponent as ecsAddComponent,
	removeComponent as ecsRemoveComponent,
} from "../ecs/world";
import type { ModifierComponent, TriggerComponent } from "../ecs/types";
import type { ScriptCtx } from "./types";

/**
 * Constrói o ScriptCtx passado para scripts e para o evaluator DSL.
 *
 * Fase 2 (Passo 9): action.* plugam no pipeline ECS em vez de mutar
 * o estado diretamente. dealDamage mantido como @deprecated compat.
 */
export function buildScriptCtx(
	state: GameState,
	skillCtx: SkillContext,
	params: Readonly<Record<string, unknown>> = {},
): ScriptCtx {
	const skillId = skillCtx.skillId ?? "unknown";
	const sourceId = skillCtx.sourceHeroId ?? skillCtx.sourceEnemyId ?? null;
	const targetId =
		skillCtx.targetHeroIds?.[0] ?? skillCtx.targetEnemyIds?.[0] ?? null;
	const targetIds: readonly string[] = [
		...(skillCtx.targetHeroIds ?? []),
		...(skillCtx.targetEnemyIds ?? []),
	];

	const ctx: ScriptCtx = {
		state,
		skillCtx,
		skillId,
		params,
		sourceId,
		targetId,
		targetIds,

		query: {
			creatureHasSkill(enemyId, sId) {
				const enemy = state.activeEnemies.find((e) => e.id === enemyId);
				if (!enemy) return false;
				const effect = resolveSkillForById(enemy.cardId, "effect");
				const purple = resolveSkillForById(enemy.cardId, "purpleEffect");
				return effect?.id === sId || purple?.id === sId;
			},
			dungeonLevel() {
				return state.despertar;
			},
			roomEnemyCount() {
				return state.activeEnemies.filter((e) => e.status === "active").length;
			},
			heroWithLowestLife() {
				const active = state.heroes.filter((h) => h.status === "active");
				if (active.length === 0) return null;
				return active.reduce((a, b) => (a.currentLife <= b.currentLife ? a : b)).id;
			},
		},

		action: {
			pushEffect(node) {
				const newStack = addPending(state.effectStack, {
					cause: skillCtx.triggeredBy,
					effect: node as import("../ecs/types").EffectDescriptor,
					source: skillId,
				});
				return { ...state, effectStack: newStack };
			},

			addComponent(entityId, component) {
				const newWorld = ecsAddComponent(state.world, entityId, component);
				return { ...state, world: newWorld };
			},

			removeComponentsBySource(entityId, source) {
				const newWorld = ecsRemoveComponent(
					state.world,
					entityId,
					(c) => {
						const typed = c as ModifierComponent | TriggerComponent;
						return "source" in typed && typed.source === source;
					},
				);
				return { ...state, world: newWorld };
			},

			emit(event) {
				// Stub Passo 7: event bus ainda não totalmente wired.
				return appendLog(state, `[emit:${event.type}] source=${skillId}`);
			},

			requestChoice(options) {
				return {
					...state,
					pendingSkillChoice: {
						skillId,
						prompt: "Escolha uma opção:",
						options: options.map((o) => ({ id: o.id, label: o.label })),
						sourceHeroId: skillCtx.sourceHeroId,
					},
				};
			},

			log(msg) {
				return appendLog(state, msg);
			},

			// @deprecated — use action.pushEffect({ kind: "apply_damage", ... })
			dealDamage(tId, amount) {
				const enemy = state.activeEnemies.find((e) => e.id === tId);
				if (enemy?.status === "active") {
					const next = applyDamage(state, tId, amount);
					return appendLog(next, `Dano direto: ${enemy.cardName} sofreu ${amount}.`);
				}
				const hero = state.heroes.find((h) => h.id === tId);
				if (hero?.status === "active") {
					const next = applyDamage(state, tId, amount);
					return appendLog(next, `Dano direto: ${hero.cardName} sofreu ${amount}.`);
				}
				return state;
			},
		},

		log: (msg) => appendLog(state, msg),

		withState(s) {
			return buildScriptCtx(s, skillCtx, params);
		},
	};

	return ctx;
}

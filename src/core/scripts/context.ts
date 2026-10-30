import type { SkillContext } from "../data/skillTypes";
import type { ModifierComponent, TriggerComponent } from "../ecs/types";
import {
	addComponent as ecsAddComponent,
	removeComponent as ecsRemoveComponent,
} from "../ecs/world";
import { addPending } from "../effects/stack";
import { log as appendLog } from "../reducer/utils";

import type { GameState } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import type { ScriptCtx } from "./types";
import { cardName, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { awakeningOf, enemiesOf, heroesOf, withWorld, worldOf, withPendingSkillChoice, withEffectStack, effectStackOf } from "../state/access";
/**
 * Constrói o ScriptCtx passado para scripts e para o evaluator DSL.
 *
 * Fase 2 (Passo 9): action.* plugam no pipeline ECS em vez de mutar
 * o estado diretamente. dealDamage mantido como @deprecated compat.
 */
export function buildScriptCtx(engine: GameEngine, 
	state: GameState,
	skillCtx: SkillContext,
	params: Readonly<Record<string, unknown>> = {},
): ScriptCtx {
	const skillId = skillCtx.skillId ?? "unknown";
	const sourceId =
		skillCtx.sourceHeroId ??
		skillCtx.sourceEnemyId ??
		skillCtx.sourceEntityId ??
		skillCtx.sourceCardId ??
		null;
	const targetId =
		skillCtx.targetHeroIds?.[0] ?? skillCtx.targetEnemyIds?.[0] ?? null;
	const targetIds: readonly string[] = [
		...(skillCtx.targetHeroIds ?? []),
		...(skillCtx.targetEnemyIds ?? []),
	];

	const ctx: ScriptCtx = {
		engine,
		state,
		skillCtx,
		skillId,
		params,
		sourceId,
		targetId,
		targetIds,

		query: {
			creatureHasSkill(enemyId, sId) {
				const enemy = enemiesOf(state).find((e) => e.id === enemyId);
				if (!enemy) return false;
				return skillsOf(engine, enemy.cardId).some(({ def }) => def.id === sId);
			},
			dungeonLevel() {
				return awakeningOf(state);
			},
			roomEnemyCount() {
				return enemiesOf(state).filter((e) => e.status === "active").length;
			},
			heroWithLowestLife() {
				const active = heroesOf(state).filter((h) => h.status === "active");
				if (active.length === 0) return null;
				return active.reduce((a, b) => (a.currentLife <= b.currentLife ? a : b))
					.id;
			},
		},

		action: {
			pushEffect(node) {
				const newStack = addPending(effectStackOf(state), {
					cause: skillCtx.triggeredBy,
					effect: node as import("../ecs/types").EffectDescriptor,
					source: skillId,
				});
				return withEffectStack(state, newStack);
			},

			addComponent(entityId, component) {
				const newWorld = ecsAddComponent(worldOf(state), entityId, component);
				return withWorld(state, newWorld);
			},

			removeComponentsBySource(entityId, source) {
				const newWorld = ecsRemoveComponent(worldOf(state), entityId, (c) => {
					const typed = c as ModifierComponent | TriggerComponent;
					return "source" in typed && typed.source === source;
				});
				return withWorld(state, newWorld);
			},

			emit(event) {
				// Stub Passo 7: event bus ainda não totalmente wired.
				return appendLog(state, `[emit:${event.type}] source=${skillId}`);
			},

			requestChoice(options, choiceOptions) {
				return withPendingSkillChoice(state, {
						skillId,
						prompt: "Escolha uma opção:",
						allowSkip: choiceOptions?.allowSkip === true,
						options: options.map((o) => ({
							id: o.id,
							label: o.label,
							...(o.effect ? { effect: o.effect } : {}),
						})),
						sourceHeroId: skillCtx.sourceHeroId,
						sourceEnemyId: skillCtx.sourceEnemyId,
						sourceCardId: skillCtx.sourceCardId,
						sourceEntityId: skillCtx.sourceEntityId,
						targetHeroIds: skillCtx.targetHeroIds,
						targetEnemyIds: skillCtx.targetEnemyIds,
						context: skillCtx,
					});
			},

			log(msg) {
				return appendLog(state, msg);
			},

			// @deprecated — use action.pushEffect({ kind: "apply_damage", ... })
			dealDamage(tId, amount) {
				const enemy = enemiesOf(state).find((e) => e.id === tId);
				if (enemy?.status === "active") {
					const next = applyDamage(engine, state, tId, amount, {
						sourceId: sourceId ?? undefined,
						damageType: "direct",
					});
					return appendLog(
						next,
						`Dano direto: ${cardName(engine, enemy.cardId)} sofreu ${amount}.`,
					);
				}
				const hero = heroesOf(state).find((h) => h.id === tId);
				if (hero?.status === "active") {
					const next = applyDamage(engine, state, tId, amount, {
						sourceId: sourceId ?? undefined,
						damageType: "direct",
					});
					return appendLog(
						next,
						`Dano direto: ${cardName(engine, hero.cardId)} sofreu ${amount}.`,
					);
				}
				return state;
			},
		},

		log: (msg) => appendLog(state, msg),

		withState(s) {
			return buildScriptCtx(engine, s, skillCtx, params);
		},
	};

	return ctx;
}

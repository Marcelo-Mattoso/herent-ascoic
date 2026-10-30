// Sistema de dano — ponto único para toda aplicação de dano no jogo.
// Atualiza tanto os arrays legados (heroes/enemies) quanto o ECS world.
// Passo 7: applyDamage emite DamageAboutToBeDealt (pré) e DamageDealt (pós).
// applyDamageMin1 é custo de vida (sem janela de bus — não é dano recebido de inimigo).

import { syncEntityFromEnemy, syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import {
	removeEntity,
	removeComponent,
	removeModifiersAppliedBySource,
	removeModifiersForSource,
	removeTriggersAppliedBySource,
	getModifierTotal,
} from "../ecs/world";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import {
	resolveSkillWindow,
	type AttackResume,
} from "../skills/resolveSkillWindow";
import { destructionPreventionFlag } from "../rules/destruction";
import {
	removeBlocksAppliedBySource,
	removeBlocksForSource,
} from "../state/blockHelpers";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

export interface DamageOptions {
	readonly sourceId?: EntityId;
	readonly damageType?: DamageType;
	/** Apenas associação visual com uma investida extra já resolvida. */
	readonly extraAttackId?: number;
	/** Interno: evita reabrir a mesma janela ao retomar uma decisão pendente. */
	readonly skipWouldBeDestroyed?: boolean;
	/** Valor já resolvido pelo bus antes de uma decisão de prevenção letal. */
	readonly resolvedAmount?: number;
}

export interface DamageContinuation {
	readonly stage: "after_dealt" | "after_hit" | "after_destroy" | "after_kill";
	readonly targetId: string;
	readonly sourceId: string;
	readonly amount: number;
	readonly attackHit: boolean;
	readonly afterAttack?: AttackResume;
}

function currentLife(state: GameState, targetId: EntityId): number | null {
	return (
		state.heroes.find((hero) => hero.id === targetId)?.currentLife ??
		state.activeEnemies.find((enemy) => enemy.id === targetId)?.currentLife ??
		null
	);
}

function consumeDestructionPrevention(
	state: GameState,
	targetId: EntityId,
): { readonly state: GameState; readonly minimumLife: number } {
	const flag = destructionPreventionFlag(targetId);
	if (!state.flags[flag]) return { state, minimumLife: 0 };
	const { [flag]: _used, ...flags } = state.flags;
	return { state: { ...state, flags }, minimumLife: 1 };
}

function damageTriggerContext(
	state: GameState,
	sourceId: EntityId,
	targetId: EntityId,
	amount: number,
) {
	const sourceHeroId = state.heroes.some((hero) => hero.id === sourceId)
		? sourceId
		: undefined;
	const sourceEnemyId = state.activeEnemies.some(
		(enemy) => enemy.id === sourceId,
	)
		? sourceId
		: undefined;
	const targetHeroIds = state.heroes.some((hero) => hero.id === targetId)
		? [targetId]
		: [];
	const targetEnemyIds = state.activeEnemies.some(
		(enemy) => enemy.id === targetId,
	)
		? [targetId]
		: [];
	return {
		sourceHeroId,
		sourceEnemyId,
		targetHeroIds,
		targetEnemyIds,
		value: amount,
		round: state.combat?.round ?? 0,
	};
}

// Aplica dano bruto sem passar pelo bus (usado internamente após o bus resolver o amount).
function applyDamageRaw(
	state: GameState,
	targetId: EntityId,
	amount: number,
	minLife: number,
): GameState {
	const heroIdx = state.heroes.findIndex((h) => h.id === targetId);
	if (heroIdx >= 0) {
		const hero = state.heroes[heroIdx] as HeroState;
		const newLife = Math.max(minLife, hero.currentLife - amount);
		const updated: HeroState = {
			...hero,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : hero.status,
		};
		return {
			...state,
			heroes: state.heroes.map((h) => (h.id === targetId ? updated : h)),
			world: syncEntityFromHero(state.world, updated),
		};
	}

	const enemyIdx = state.activeEnemies.findIndex((e) => e.id === targetId);
	if (enemyIdx >= 0) {
		const enemy = state.activeEnemies[enemyIdx] as EnemyState;
		const newLife = Math.max(minLife, enemy.currentLife - amount);
		const updated: EnemyState = {
			...enemy,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : enemy.status,
		};
		return {
			...state,
			activeEnemies: state.activeEnemies.map((e) =>
				e.id === targetId ? updated : e,
			),
			world: syncEntityFromEnemy(state.world, updated),
		};
	}

	return state;
}

/** Retoma somente as etapas ainda não executadas após uma escolha reativa. */
export function continueDamage(
	state: GameState,
	continuation: DamageContinuation,
): GameState {
	const { targetId, sourceId, amount, attackHit } = continuation;
	let next = state;
	const ctx = damageTriggerContext(next, sourceId, targetId, amount);

	if (continuation.stage === "after_dealt") {
		if (attackHit && ctx.sourceHeroId && ctx.targetEnemyIds.length > 0) {
			next = resolveSkillWindow(next, {
				event: "evt_hit",
				ctx: {
					triggeredBy: "evt_hit",
					...ctx,
					targetHeroIds: [ctx.sourceHeroId],
				},
				resume: {
					type: "continue_damage",
					...continuation,
					stage: "after_hit",
				},
			});
			if (
				next.pendingTriggerInterrupt ||
				next.pendingSkillChoice ||
				next.pendingSkillTarget
			)
				return next;
		}
	}

	if (
		continuation.stage === "after_dealt" ||
		continuation.stage === "after_hit"
	) {
		const defeatedHero = next.heroes.find(
			(hero) => hero.id === targetId && hero.status === "defeated",
		);
		if (defeatedHero) {
			({ state: next } = emit(next, {
				type: "HeroDefeated",
				payload: { heroId: targetId, sourceId },
			}));
			next = {
				...next,
				world: removeTriggersAppliedBySource(
					removeComponent(
						removeModifiersAppliedBySource(next.world, targetId),
						targetId,
						(component) => component.type === "trigger",
					),
					targetId,
				),
			};
			next = removeBlocksAppliedBySource(next, targetId);
		}
		const defeatedEnemy = next.activeEnemies.find(
			(enemy) => enemy.id === targetId && enemy.status === "defeated",
		);
		if (!defeatedEnemy) return next;
		next = resolveSkillWindow(next, {
			event: "evt_destroy",
			ctx: {
				triggeredBy: "evt_destroy",
				...damageTriggerContext(next, sourceId, targetId, amount),
			},
			resume: {
				type: "continue_damage",
				...continuation,
				stage: "after_destroy",
			},
		});
		if (
			next.pendingTriggerInterrupt ||
			next.pendingSkillChoice ||
			next.pendingSkillTarget
		)
			return next;
	}

	if (
		!next.activeEnemies.some(
			(enemy) => enemy.id === targetId && enemy.status === "defeated",
		)
	)
		return next;
	if (continuation.stage !== "after_kill") {
		const killCtx = damageTriggerContext(next, sourceId, targetId, amount);
		if (killCtx.sourceHeroId) {
			next = resolveSkillWindow(next, {
				event: "evt_kill",
				ctx: { triggeredBy: "evt_kill", ...killCtx },
				resume: {
					type: "continue_damage",
					...continuation,
					stage: "after_kill",
				},
			});
			if (
				next.pendingTriggerInterrupt ||
				next.pendingSkillChoice ||
				next.pendingSkillTarget
			)
				return next;
		}
	}

	// A entidade derrotada permanece no array até a fase de recompensas, mas
	// seus componentes e efeitos vinculados não podem sobreviver à destruição.
	const preyByHero = Object.fromEntries(
		Object.entries(next.combat?.preyByHero ?? {}).filter(
			([, preyId]) => preyId !== targetId,
		),
	);
	if (next.combat) {
		next = {
			...next,
			combat: {
				...next.combat,
				prey: next.combat.prey === targetId ? null : next.combat.prey,
				preyByHero,
			},
		};
	}
	const roomFirstKill = next.creaturesDefeated === 0;
	({ state: next } = emit(next, {
		type: "EnemyDestroyed",
		payload: { enemyId: targetId, sourceId, roomFirstKill },
	}));
	const worldAfterRemove = removeEntity(next.world, targetId);
	next = {
		...next,
		world: removeTriggersAppliedBySource(
			removeModifiersForSource(worldAfterRemove, targetId),
			targetId,
		),
	};
	return removeBlocksForSource(next, targetId);
}

// Aplica dano com janela de pré-evento (bus): ouvintes podem modificar o amount.
export function applyDamage(
	state: GameState,
	targetId: EntityId,
	amount: number,
	opts?: DamageOptions,
): GameState {
	if (
		!state.heroes.some((hero) => hero.id === targetId && hero.status === "active") &&
		!state.activeEnemies.some((enemy) => enemy.id === targetId && enemy.status === "active")
	) {
		return state;
	}
	const sourceId = opts?.sourceId ?? "system";
	const damageType = opts?.damageType ?? "physical";

	// Janela pré: listeners podem reduzir/aumentar o dano.
	const preDamage =
		opts?.resolvedAmount === undefined
			? emit(state, {
					type: "DamageAboutToBeDealt",
					payload: { sourceId, targetId, damageType, amount },
				})
			: null;
	let s1 = preDamage?.state ?? state;
	if (s1.pendingTriggerInterrupt) return s1;
	const amountAfterBus = preDamage
		? (preDamage.event.payload as { amount: number }).amount
		: (opts?.resolvedAmount ?? amount);
	const purpleReduction =
		damageType === "purple"
			? Math.max(
					0,
					-getModifierTotal(s1.world, targetId, "purple_damage_taken"),
				)
			: 0;
	const finalAmount =
		opts?.resolvedAmount === undefined
			? Math.max(0, amountAfterBus - purpleReduction)
			: amountAfterBus;
	const lifeBeforeDamage = currentLife(s1, targetId);
	if (
		!opts?.skipWouldBeDestroyed &&
		finalAmount > 0 &&
		lifeBeforeDamage !== null &&
		finalAmount >= lifeBeforeDamage
	) {
		const { state: sBeforeDestroy } = emit(s1, {
			type: "EntityWouldBeDestroyed",
			payload: { sourceId, targetId, damageType, amount: finalAmount },
		});
		const pending = resolveSkillWindow(sBeforeDestroy, {
			event: "evt_would_be_destroyed",
			ctx: {
				triggeredBy: "evt_would_be_destroyed",
				...damageTriggerContext(
					sBeforeDestroy,
					sourceId,
					targetId,
					finalAmount,
				),
			},
			resume: {
				type: "apply_damage",
				targetId,
				amount: finalAmount,
				sourceId,
				damageType,
			},
		});
		if (
			pending.pendingTriggerInterrupt ||
			pending.pendingSkillChoice ||
			pending.pendingSkillTarget
		)
			return pending;
		s1 = pending;
	}
	if (finalAmount <= 0) return s1;
	const protection = consumeDestructionPrevention(s1, targetId);
	const lifeImmediatelyBeforeApply = currentLife(protection.state, targetId);

	// Aplicar o dano com o valor modificado.
	let s2 = applyDamageRaw(
		protection.state,
		targetId,
		finalAmount,
		protection.minimumLife,
	);
	const appliedAmount = Math.max(
		0,
		(lifeImmediatelyBeforeApply ?? 0) - (currentLife(s2, targetId) ?? 0),
	);
	if (appliedAmount > 0) {
		const previous = s2.damageFeedback ?? [];
		s2 = {
			...s2,
			damageFeedback: [
				...previous.slice(-63),
				{
					id: (previous.at(-1)?.id ?? 0) + 1,
					targetId,
					side: s2.heroes.some((hero) => hero.id === targetId)
						? "hero"
						: "enemy",
					amount: appliedAmount,
					extraAttackId: opts?.extraAttackId,
				},
			],
		};
	}

	// Janela pós: listeners reagem ao dano já aplicado.
	const { state: s3 } = emit(s2, {
		type: "DamageDealt",
		payload: { sourceId, targetId, damageType, amount: finalAmount },
	});
	if (s3.pendingTriggerInterrupt) return s3;

	const ctx = damageTriggerContext(s3, sourceId, targetId, finalAmount);
	const attackHit = damageType === "attack" && finalAmount > 0;
	const continuation: DamageContinuation = {
		stage: "after_dealt",
		targetId,
		sourceId,
		amount: finalAmount,
		attackHit,
	};
	const s4 = resolveSkillWindow(s3, {
		event: "evt_damage_dealt",
		ctx: { triggeredBy: "evt_damage_dealt", ...ctx },
		resume: { type: "continue_damage", ...continuation },
	});
	if (
		s4.pendingTriggerInterrupt ||
		s4.pendingSkillChoice ||
		s4.pendingSkillTarget
	)
		return s4;
	return continueDamage(s4, continuation);
}

// Aplica custo de vida mínimo 1 (skill cost / self-damage).
// NÃO passa pelo bus — custos de skill não ativam redutores de dano de inimigos.
export function applyDamageMin1(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	return applyDamageRaw(state, targetId, amount, 1);
}

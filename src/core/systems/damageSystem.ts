import type { EntityId } from "../ecs/types";
import {
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
import type { GameState } from "../state/gameState";
import type { GameEngine } from "../gameEngine";

import { statOf, withEnemyRecord, withEntityRetired, withHeroRecord, withUnitStats, withWorld, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
export interface DamageOptions {
	readonly sourceId?: EntityId;
	readonly damageType?: DamageType;
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
	if (
		!gameOf(state).heroes.some((hero) => hero.id === targetId) &&
		!gameOf(state).activeEnemies.some((enemy) => enemy.id === targetId)
	) {
		return null;
	}
	return statOf(state, targetId, "currentLife") ?? null;
}

function consumeDestructionPrevention(
	state: GameState,
	targetId: EntityId,
): { readonly state: GameState; readonly minimumLife: number } {
	const flag = destructionPreventionFlag(targetId);
	if (!gameOf(state).flags[flag]) return { state, minimumLife: 0 };
	const { [flag]: _used, ...flags } = gameOf(state).flags;
	return { state: withGame(state, (prevGame) => ({ ...prevGame, flags })), minimumLife: 1 };
}

function damageTriggerContext(
	state: GameState,
	sourceId: EntityId,
	targetId: EntityId,
	amount: number,
) {
	const sourceHeroId = gameOf(state).heroes.some((hero) => hero.id === sourceId)
		? sourceId
		: undefined;
	const sourceEnemyId = gameOf(state).activeEnemies.some(
		(enemy) => enemy.id === sourceId,
	)
		? sourceId
		: undefined;
	const targetHeroIds = gameOf(state).heroes.some((hero) => hero.id === targetId)
		? [targetId]
		: [];
	const targetEnemyIds = gameOf(state).activeEnemies.some(
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
		round: gameOf(state).combat?.round ?? 0,
	};
}

// Aplica dano bruto sem passar pelo bus (usado internamente após o bus resolver o amount).
function applyDamageRaw(
	state: GameState,
	targetId: EntityId,
	amount: number,
	minLife: number,
): GameState {
	const isHero = gameOf(state).heroes.some((h) => h.id === targetId);
	if (!isHero && !gameOf(state).activeEnemies.some((e) => e.id === targetId)) {
		return state;
	}
	const life = statOf(state, targetId, "currentLife") as number;
	const newLife = Math.max(minLife, life - amount);
	const next = withUnitStats(state, targetId, { currentLife: newLife });
	if (newLife > 0) return next;
	return isHero
		? withHeroRecord(next, targetId, (h) => ({ ...h, status: "defeated" }))
		: withEnemyRecord(next, targetId, (e) => ({ ...e, status: "defeated" }));
}

/** Retoma somente as etapas ainda não executadas após uma escolha reativa. */
export function continueDamage(engine: GameEngine, 
	state: GameState,
	continuation: DamageContinuation,
): GameState {
	const { targetId, sourceId, amount, attackHit } = continuation;
	let next = state;
	const ctx = damageTriggerContext(next, sourceId, targetId, amount);

	if (continuation.stage === "after_dealt") {
		if (attackHit && ctx.sourceHeroId && ctx.targetEnemyIds.length > 0) {
			next = resolveSkillWindow(engine, next, {
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
				pendingTriggerInterruptOf(next) ||
				pendingSkillChoiceOf(next) ||
				pendingSkillTargetOf(next)
			)
				return next;
		}
	}

	if (
		continuation.stage === "after_dealt" ||
		continuation.stage === "after_hit"
	) {
		const defeatedHero = gameOf(next).heroes.find(
			(hero) => hero.id === targetId && hero.status === "defeated",
		);
		if (defeatedHero) {
			({ state: next } = emit(engine, next, {
				type: "HeroDefeated",
				payload: { heroId: targetId, sourceId },
			}));
			next = withWorld(next, removeTriggersAppliedBySource(
					removeComponent(
						removeModifiersAppliedBySource(worldOf(next), targetId),
						targetId,
						(component) => component.type === "trigger",
					),
					targetId,
				));
			next = removeBlocksAppliedBySource(next, targetId);
		}
		const defeatedEnemy = gameOf(next).activeEnemies.find(
			(enemy) => enemy.id === targetId && enemy.status === "defeated",
		);
		if (!defeatedEnemy) return next;
		next = resolveSkillWindow(engine, next, {
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
			pendingTriggerInterruptOf(next) ||
			pendingSkillChoiceOf(next) ||
			pendingSkillTargetOf(next)
		)
			return next;
	}

	if (
		!gameOf(next).activeEnemies.some(
			(enemy) => enemy.id === targetId && enemy.status === "defeated",
		)
	)
		return next;
	if (continuation.stage !== "after_kill") {
		const killCtx = damageTriggerContext(next, sourceId, targetId, amount);
		if (killCtx.sourceHeroId) {
			next = resolveSkillWindow(engine, next, {
				event: "evt_kill",
				ctx: { triggeredBy: "evt_kill", ...killCtx },
				resume: {
					type: "continue_damage",
					...continuation,
					stage: "after_kill",
				},
			});
			if (
				pendingTriggerInterruptOf(next) ||
				pendingSkillChoiceOf(next) ||
				pendingSkillTargetOf(next)
			)
				return next;
		}
	}

	// A entidade derrotada permanece no array até a fase de recompensas, mas
	// seus componentes e efeitos vinculados não podem sobreviver à destruição.
	const preyByHero = Object.fromEntries(
		Object.entries(gameOf(next).combat?.preyByHero ?? {}).filter(
			([, preyId]) => preyId !== targetId,
		),
	);
	if (gameOf(next).combat) {
		next = withGame(next, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(next).combat!,
				prey: gameOf(next).combat!.prey === targetId ? null : gameOf(next).combat!.prey,
				preyByHero,
			} }));
	}
	const roomFirstKill = gameOf(next).creaturesDefeated === 0;
	({ state: next } = emit(engine, next, {
		type: "EnemyDestroyed",
		payload: { enemyId: targetId, sourceId, roomFirstKill },
	}));
	next = withEntityRetired(next, targetId);
	next = withWorld(next, removeTriggersAppliedBySource(
			removeModifiersForSource(worldOf(next), targetId),
			targetId,
		));
	return removeBlocksForSource(next, targetId);
}

// Aplica dano com janela de pré-evento (bus): ouvintes podem modificar o amount.
export function applyDamage(engine: GameEngine, 
	state: GameState,
	targetId: EntityId,
	amount: number,
	opts?: DamageOptions,
): GameState {
	if (
		!gameOf(state).heroes.some((hero) => hero.id === targetId && hero.status === "active") &&
		!gameOf(state).activeEnemies.some((enemy) => enemy.id === targetId && enemy.status === "active")
	) {
		return state;
	}
	const sourceId = opts?.sourceId ?? "system";
	const damageType = opts?.damageType ?? "physical";

	// Janela pré: listeners podem reduzir/aumentar o dano.
	const preDamage =
		opts?.resolvedAmount === undefined
			? emit(engine, state, {
					type: "DamageAboutToBeDealt",
					payload: { sourceId, targetId, damageType, amount },
				})
			: null;
	let s1 = preDamage?.state ?? state;
	if (pendingTriggerInterruptOf(s1)) return s1;
	const amountAfterBus = preDamage
		? (preDamage.event.payload as { amount: number }).amount
		: (opts?.resolvedAmount ?? amount);
	const purpleReduction =
		damageType === "purple"
			? Math.max(
					0,
					-getModifierTotal(worldOf(s1), targetId, "purple_damage_taken"),
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
		const { state: sBeforeDestroy } = emit(engine, s1, {
			type: "EntityWouldBeDestroyed",
			payload: { sourceId, targetId, damageType, amount: finalAmount },
		});
		const pending = resolveSkillWindow(engine, sBeforeDestroy, {
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
			pendingTriggerInterruptOf(pending) ||
			pendingSkillChoiceOf(pending) ||
			pendingSkillTargetOf(pending)
		)
			return pending;
		s1 = pending;
	}
	if (finalAmount <= 0) return s1;
	const protection = consumeDestructionPrevention(s1, targetId);

	// Aplicar o dano com o valor modificado.
	const s2 = applyDamageRaw(
		protection.state,
		targetId,
		finalAmount,
		protection.minimumLife,
	);

	// Janela pós: listeners reagem ao dano já aplicado.
	const { state: s3 } = emit(engine, s2, {
		type: "DamageDealt",
		payload: { sourceId, targetId, damageType, amount: finalAmount },
	});
	if (pendingTriggerInterruptOf(s3)) return s3;

	const ctx = damageTriggerContext(s3, sourceId, targetId, finalAmount);
	const attackHit = damageType === "attack" && finalAmount > 0;
	const continuation: DamageContinuation = {
		stage: "after_dealt",
		targetId,
		sourceId,
		amount: finalAmount,
		attackHit,
	};
	const s4 = resolveSkillWindow(engine, s3, {
		event: "evt_damage_dealt",
		ctx: { triggeredBy: "evt_damage_dealt", ...ctx },
		resume: { type: "continue_damage", ...continuation },
	});
	if (
		pendingTriggerInterruptOf(s4) ||
		pendingSkillChoiceOf(s4) ||
		pendingSkillTargetOf(s4)
	)
		return s4;
	return continueDamage(engine, s4, continuation);
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

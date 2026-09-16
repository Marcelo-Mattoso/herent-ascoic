import { drainStack } from "../effects/resolver";
import type { GameState } from "../state/gameState";
import { getCardById } from "../data/cards";
import {
	collectEventAbilityGrantCandidates,
	eventGrantMatchesContext,
	executeAbilityGrant,
	canExecuteAbilityGrant,
} from "../abilities/executor";
import { ActivationTracker } from "../state/activation";
import type { SkillContext } from "../data/skillTypes";
import type { EventName, EffectNode } from "./dsl/types";
import {
	candidateCanFire,
	collectTriggerCandidates,
	createPendingTriggerInterrupt,
	executeTriggerCandidate,
	fireTriggerDecision,
	triggerDecisionFlag,
	type PendingTriggerInterrupt,
	type TriggerCandidate,
} from "../triggers/engine";

export type SkillWindowResume =
	| { readonly type: "none" }
	| { readonly type: "roll_dice" }
	| { readonly type: "resolve_attack" }
	| { readonly type: "continue_rewards_after_room_win" }
	| { readonly type: "finish_rewards" }
	| {
			readonly type: "apply_damage";
			readonly targetId: string;
			readonly amount: number;
			readonly sourceId: string;
			readonly damageType: import("../events/types").DamageType;
	  }
	| { readonly type: "advance_dungeon"; readonly exits: number }
	| {
			readonly type: "discard_dungeon";
			readonly count: number;
			readonly reason: "effect" | "extra";
	  };

export interface PendingSkillWindow {
	readonly event: EventName;
	readonly ctx: SkillContext;
	readonly resume: SkillWindowResume;
	/** Candidatas automáticas já executadas antes de uma escolha interromper a janela. */
	readonly resolvedCandidateIds?: readonly string[];
}

export interface SkillWindowRequest {
	readonly event: EventName;
	readonly ctx?: SkillContext;
	readonly resume?: SkillWindowResume;
	readonly resolvedCandidateIds?: readonly string[];
}

/**
 * Contrato entre o catálogo de skills e os fluxos reais do jogo.
 * Cada evento que pode constar em `skills.yaml` precisa ter ao menos um ponto
 * que chama `resolveSkillWindow`; o teste de integração valida o catálogo
 * contra este registro para evitar triggers declarados, porém inalcançáveis.
 */
export const TRIGGER_EVENT_EMITTERS: Readonly<
	Record<EventName, readonly string[]>
> = {
	evt_attack_declared: ["reducer/combat.handleRollDice", "reducer/combat.resolveExtraEnemyCombatRoll"],
	evt_roll: ["reducer/combat.handleRollDice", "reducer/combat.resolveExtraEnemyCombatRoll"],
	evt_hit: ["systems/damageSystem.applyDamage"],
	evt_damage_dealt: ["systems/damageSystem.applyDamage"],
	evt_damage_taken: ["reducer/combat.handleResolveAttack"],
	evt_would_be_destroyed: ["systems/damageSystem.applyDamage"],
	evt_destroy: ["systems/damageSystem.applyDamage"],
	evt_kill: ["systems/damageSystem.applyDamage"],
	evt_combat_start: ["reducer/combat.handleStartCombat"],
	evt_combat_end: ["reducer/reward.handleGrantRewards"],
	evt_round_start: ["reducer/combat.handleStartCombat", "reducer/combat.handleAdvanceRound"],
	evt_round_end: ["reducer/combat.handleAdvanceRound"],
	evt_room_reveal: ["reducer/exploration.handleRevealRoom"],
	evt_room_enter: ["reducer/exploration.handleRevealRoom"],
	evt_room_won: ["reducer/reward.handleGrantRewards"],
	evt_room_leave: ["reducer/exploration.handleCheckBossCondition"],
	evt_dungeon_discard: ["reducer/exploration.resumeDungeonAdvance", "reducer/exploration.discardFromDungeonDeck"],
	evt_enter_play: ["reducer/exploration.handleSpawnEnemies"],
	evt_leave_play: ["reducer/combat.handleResolveAttack"],
	evt_targeted: ["reducer/combat.resolveExtraEnemyCombatRoll"],
};

const ITEM_STATS_HANDLED_BY_EQUIPMENT = new Set([
	"item_skill_deadly_edge",
	"item_skill_drain_life_and_deadly_edge",
	"item_skill_block",
	"item_skill_block_and_last_light_ward",
	"item_skill_last_light_blade",
]);

function requestCtx(request: SkillWindowRequest): SkillContext {
	return {
		triggeredBy: request.event,
		...(request.ctx ?? {}),
	};
}

function isCombatStatus(state: GameState): boolean {
	return (
		state.status === "HERO_ACTION" ||
		state.status === "ROLL_DICE" ||
		state.status === "RESOLVE_ATTACK" ||
		state.status === "DIRECT_DAMAGE" ||
		state.status === "CHECK_COMBAT_END" ||
		state.status === "BOSS_COMBAT"
	);
}

function effectNeedsPlayerDecision(
	effect: EffectNode,
	event: EventName,
): boolean {
	if (
		effect.kind === "i_prevent_dungeon_discard" ||
		effect.kind === "i_ignore_next_targeting" ||
		effect.kind === "i_modify_die" ||
		effect.kind === "i_reroll" ||
		effect.kind === "i_set_die" ||
		effect.kind === "i_mark_target" ||
		effect.kind === "i_choose_one"
	) {
		return true;
	}
	if (effect.kind === "i_damage" && effect.to === "$source") return true;
	if (
		event === "evt_damage_taken" &&
		effect.kind === "p_modifier" &&
		(effect.stat === "s_damage_reduction" ||
			effect.stat === "s_purple_damage_reduction")
	) {
		return true;
	}
	if (effect.kind === "i_if") {
		return (
			effect.then.some((child) => effectNeedsPlayerDecision(child, event)) ||
			Boolean(
				effect.else?.some((child) => effectNeedsPlayerDecision(child, event)),
			)
		);
	}
	if (effect.kind === "i_for_each") {
		return effect.do.some((child) => effectNeedsPlayerDecision(child, event));
	}
	return false;
}

function shouldSkipCandidate(candidate: TriggerCandidate): boolean {
	const item =
		candidate.source.kind === "item"
			? getCardById(candidate.source.cardId)
			: undefined;
	if (item?.type === "item" && item.grants?.length) return true;
	if (
		candidate.source.kind === "item" &&
		ITEM_STATS_HANDLED_BY_EQUIPMENT.has(candidate.definition.id) &&
		!(item?.type === "item" && item.useTiming)
	) {
		return true;
	}
	return false;
}

function shouldPromptCandidate(candidate: TriggerCandidate): boolean {
	if (candidate.source.kind === "hero") {
		if (candidate.definition.category === "hero_power") return true;
		if (candidate.definition.script) return true;
		return Boolean(
			candidate.definition.effect?.some((effect) =>
				effectNeedsPlayerDecision(effect, candidate.event),
			),
		);
	}
	if (
		(candidate.source.kind === "item" ||
			candidate.source.kind === "artifact") &&
		candidate.definition.effect?.some((effect) =>
			effectNeedsPlayerDecision(effect, candidate.event),
		)
	) {
		return true;
	}
	if (candidate.mode === "prompt") return true;
	return false;
}

function applyActivationCost(
	state: GameState,
	pending: PendingTriggerInterrupt,
): GameState {
	let next = state;
	const inCombat = isCombatStatus(state);

	if (pending.sourceKind === "hero" && pending.sourceHeroId && inCombat) {
		next = ActivationTracker.endHeroTurn(next, pending.sourceHeroId);
	}

	if (pending.sourceKind === "item" && pending.sourceHeroId) {
		const item = getCardById(pending.sourceCardId);
		if (inCombat && item?.type !== "item") {
			next = ActivationTracker.endHeroTurn(next, pending.sourceHeroId);
		}
		next = ActivationTracker.disable(next, {
			kind: "item",
			id: `${pending.sourceHeroId}:${pending.sourceCardId}`,
			scope: inCombat ? "combat" : "room",
			sourceId: pending.sourceHeroId,
			reason: `usou ${pending.skillId}`,
		});
	}

	if (pending.sourceKind === "artifact" && pending.sourceCardId) {
		next = ActivationTracker.disable(next, {
			kind: "artifact",
			id: pending.sourceCardId,
			scope: inCombat ? "combat" : "room",
			sourceId: pending.sourceHeroId,
			reason: `usou ${pending.skillId}`,
		});
	}

	return next;
}

export function resolveSkillWindow(
	state: GameState,
	request: SkillWindowRequest,
): GameState {
	if (
		state.pendingTriggerInterrupt ||
		state.pendingSkillChoice ||
		state.pendingSkillTarget
	) {
		return state;
	}

	const ctx = requestCtx(request);
	const resume = request.resume ?? { type: "none" as const };
	const resolvedCandidateIds = new Set(request.resolvedCandidateIds ?? []);
	const candidates = collectTriggerCandidates(state, request.event);
	let current = state;
	const grantCandidates = collectEventAbilityGrantCandidates(current, request.event);

	for (const candidate of grantCandidates) {
		if (!eventGrantMatchesContext(candidate, request.event, ctx)) continue;
		if (
			canExecuteAbilityGrant(
				current,
				candidate.source,
				candidate.grant,
				request.event,
			)
		)
			continue;
		const pendingId = [
			"grant",
			request.event,
			candidate.source.sourceHeroId ?? candidate.source.sourceEnemyId ?? "group",
			candidate.source.cardId,
			candidate.grant.id,
		].join(":");
		if (resolvedCandidateIds.has(pendingId)) continue;
		if (current.flags[triggerDecisionFlag(pendingId)]) continue;
		if (candidate.grant.activation.decision !== "automatic") {
			return {
				...current,
				pendingTriggerInterrupt: {
					id: pendingId,
					grantId: candidate.grant.id,
					skillId: candidate.grant.abilityId,
					event: request.event,
					window: candidate.grant.activation.window ?? "before_damage",
					sourceKind: candidate.source.kind,
					sourceCardId: candidate.source.cardId,
					sourceHeroId: candidate.source.sourceHeroId,
					sourceEnemyId: candidate.source.sourceEnemyId,
					targetHeroIds: ctx.targetHeroIds,
					targetEnemyIds: ctx.targetEnemyIds,
					value: ctx.value ?? null,
					reason: "Esta habilidade pode ser usada nesta fase.",
					description: candidate.grant.abilityId,
				},
				pendingSkillWindow: {
					event: request.event,
					ctx,
					resume,
					resolvedCandidateIds: [...resolvedCandidateIds],
				},
			};
		}
		current = executeAbilityGrant(current, {
			source: candidate.source,
			grant: candidate.grant,
			triggeredBy: request.event,
			targetIds: [...(ctx.targetHeroIds ?? []), ...(ctx.targetEnemyIds ?? [])],
			value: ctx.value,
		});
		if (current.pendingSkillChoice || current.pendingSkillTarget) {
			resolvedCandidateIds.add(pendingId);
			return {
				...current,
				flags: {
					...current.flags,
					[triggerDecisionFlag(pendingId)]: true,
				},
				pendingSkillWindow: {
					event: request.event,
					ctx,
					resume,
					resolvedCandidateIds: [...resolvedCandidateIds],
				},
			};
		}
		resolvedCandidateIds.add(pendingId);
	}

	for (const candidate of candidates) {
		if (shouldSkipCandidate(candidate)) continue;
		if (!candidateCanFire(current, candidate, ctx)) continue;

		const pending = createPendingTriggerInterrupt(candidate, ctx);
		if (resolvedCandidateIds.has(pending.id)) continue;
		if (current.flags[triggerDecisionFlag(pending.id)]) continue;

		if (shouldPromptCandidate(candidate)) {
			return {
				...current,
				pendingTriggerInterrupt: pending,
				pendingSkillWindow: {
					event: request.event,
					ctx,
					resume,
					resolvedCandidateIds: [...resolvedCandidateIds],
				},
			};
		}

		current = executeTriggerCandidate(current, candidate, ctx);
		current = drainStack(current);
		if (
			current.pendingTriggerInterrupt ||
			current.pendingSkillChoice ||
			current.pendingSkillTarget
		) {
			resolvedCandidateIds.add(pending.id);
			return {
				...current,
				flags: {
					...current.flags,
					[triggerDecisionFlag(pending.id)]: true,
				},
				pendingSkillWindow: {
					event: request.event,
					ctx,
					resume,
					resolvedCandidateIds: [...resolvedCandidateIds],
				},
			};
		}
		resolvedCandidateIds.add(pending.id);
	}

	return { ...current, pendingSkillWindow: undefined };
}

export function applySkillWindowDecision(
	state: GameState,
	pending: PendingTriggerInterrupt,
	window: PendingSkillWindow | undefined,
): GameState {
	const cleared = {
		...state,
		pendingTriggerInterrupt: undefined,
		pendingSkillWindow: undefined,
		flags: {
			...state.flags,
			[triggerDecisionFlag(pending.id)]: true,
		},
	};
	if (pending.grantId) {
		const candidate = collectEventAbilityGrantCandidates(cleared, pending.event).find(
			(entry) =>
				entry.grant.id === pending.grantId &&
				entry.source.cardId === pending.sourceCardId &&
				entry.source.sourceHeroId === pending.sourceHeroId &&
				entry.source.sourceEnemyId === pending.sourceEnemyId,
		);
		if (!candidate) return cleared;
		let applied = executeAbilityGrant(cleared, {
			source: candidate.source,
			grant: candidate.grant,
			triggeredBy: pending.event,
			targetIds: [
				...(pending.targetHeroIds ?? []),
				...(pending.targetEnemyIds ?? []),
			],
			value: pending.value,
		});
		if (!window) return applied;
		return resolveSkillWindow(applied, window);
	}
	let applied = fireTriggerDecision(cleared, pending);
	applied = drainStack(applied);
	applied = applyActivationCost(applied, pending);

	if (!window) return applied;
	return resolveSkillWindow(applied, window);
}

export function skipSkillWindowDecision(
	state: GameState,
	pending: PendingTriggerInterrupt,
	window: PendingSkillWindow | undefined,
): GameState {
	const skipped = {
		...state,
		pendingTriggerInterrupt: undefined,
		pendingSkillWindow: undefined,
		flags: {
			...state.flags,
			[triggerDecisionFlag(pending.id)]: true,
		},
	};

	if (!window) return skipped;
	return resolveSkillWindow(skipped, window);
}

import { drainStack } from "../effects/resolver";
import type { GameState } from "../state/gameState";
import { getCardById } from "../data/cards";
import {
	collectEventAbilityGrantCandidates,
	eventGrantMatchesContext,
	executeAbilityGrant,
	canExecuteAbilityGrant,
} from "../abilities/executor";
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
			readonly type: "continue_damage";
			readonly stage:
				| "after_dealt"
				| "after_hit"
				| "after_destroy"
				| "after_kill";
			readonly targetId: string;
			readonly sourceId: string;
			readonly amount: number;
			readonly attackHit: boolean;
			readonly afterAttack?: AttackResume;
	  }
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

export interface AttackResume {
	readonly stage: "after_enemy_damage" | "after_hero_damage";
	readonly heroId: string;
	readonly enemyId: string;
	readonly heroDamageAmount: number;
	readonly enemyDamageLog?: string;
	readonly heroDamageLog?: string;
}

export interface PendingSkillWindow {
	readonly event: EventName;
	readonly ctx: SkillContext;
	readonly resume: SkillWindowResume;
	/** Janela interrompida por um efeito que abriu outra decisão. */
	readonly parent?: PendingSkillWindow;
	/** Candidatas automáticas já executadas antes de uma escolha interromper a janela. */
	readonly resolvedCandidateIds?: readonly string[];
}

export interface SkillWindowRequest {
	readonly event: EventName;
	readonly ctx?: SkillContext;
	readonly resume?: SkillWindowResume;
	readonly resolvedCandidateIds?: readonly string[];
	readonly parent?: PendingSkillWindow;
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
	evt_attack_declared: [
		"reducer/combat.handleRollDice",
		"reducer/combat.resolveExtraEnemyCombatRoll",
	],
	evt_roll: [
		"reducer/combat.handleRollDice",
		"reducer/combat.resolveExtraEnemyCombatRoll",
	],
	evt_hit: ["systems/damageSystem.applyDamage"],
	evt_damage_dealt: ["systems/damageSystem.applyDamage"],
	evt_damage_taken: ["reducer/combat.handleResolveAttack"],
	evt_would_be_destroyed: ["systems/damageSystem.applyDamage"],
	evt_destroy: ["systems/damageSystem.applyDamage"],
	evt_kill: ["systems/damageSystem.applyDamage"],
	evt_combat_start: ["reducer/combat.handleStartCombat"],
	evt_combat_end: ["reducer/reward.handleGrantRewards"],
	evt_round_start: [
		"reducer/combat.handleStartCombat",
		"reducer/combat.handleAdvanceRound",
	],
	evt_round_end: ["reducer/combat.handleAdvanceRound"],
	evt_room_reveal: ["reducer/exploration.handleRevealRoom"],
	evt_room_enter: ["reducer/exploration.handleRevealRoom"],
	evt_room_won: ["reducer/reward.handleGrantRewards"],
	evt_room_leave: ["reducer/exploration.handleCheckBossCondition"],
	evt_dungeon_discard: [
		"reducer/exploration.resumeDungeonAdvance",
		"reducer/exploration.discardFromDungeonDeck",
	],
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
	// O combate de boss tem janelas e regras próprias em reducer/boss.ts.
	// Não permitir que os mesmos efeitos do catálogo rodem também aqui evita
	// duplicar Trono Vivo/Ascensão Final.
	if (candidate.definition.category === "boss_skill") return true;
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
	if (
		candidate.definition.interrupt?.mode === "auto" ||
		candidate.mode === "passive"
	)
		return false;
	if (candidate.definition.interrupt?.mode === "prompt") return true;
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
	const grantCandidates = collectEventAbilityGrantCandidates(
		current,
		request.event,
	);

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
			candidate.source.sourceHeroId ??
				candidate.source.sourceEnemyId ??
				"group",
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
					parent: request.parent,
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
		if (current.pendingTriggerInterrupt) {
			resolvedCandidateIds.add(pendingId);
			const parent: PendingSkillWindow = {
				event: request.event, ctx, resume, parent: request.parent,
				resolvedCandidateIds: [...resolvedCandidateIds],
			};
			return {
				...current,
				flags: { ...current.flags, [triggerDecisionFlag(pendingId)]: true },
				pendingSkillWindow: current.pendingSkillWindow
					? { ...current.pendingSkillWindow, parent }
					: parent,
			};
		}
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
					parent: request.parent,
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
					parent: request.parent,
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
			const parent: PendingSkillWindow = {
				event: request.event, ctx, resume, parent: request.parent,
				resolvedCandidateIds: [...resolvedCandidateIds],
			};
			return {
				...current,
				flags: {
					...current.flags,
					[triggerDecisionFlag(pending.id)]: true,
				},
				pendingSkillWindow: current.pendingTriggerInterrupt && current.pendingSkillWindow
					? { ...current.pendingSkillWindow, parent }
					: parent,
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
		const candidate = collectEventAbilityGrantCandidates(
			cleared,
			pending.event,
		).find(
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
		if (applied.pendingTriggerInterrupt)
			return {
				...applied,
				pendingSkillWindow: applied.pendingSkillWindow
					? { ...applied.pendingSkillWindow, parent: window }
					: window,
			};
		if (applied.pendingSkillChoice || applied.pendingSkillTarget)
			return { ...applied, pendingSkillWindow: window };
		return resolveSkillWindow(applied, window);
	}
	let applied = fireTriggerDecision(cleared, pending);
	applied = drainStack(applied);

	if (!window) return applied;
	if (applied.pendingTriggerInterrupt)
		return {
			...applied,
			pendingSkillWindow: applied.pendingSkillWindow
				? { ...applied.pendingSkillWindow, parent: window }
				: window,
		};
	if (applied.pendingSkillChoice || applied.pendingSkillTarget)
		return { ...applied, pendingSkillWindow: window };
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

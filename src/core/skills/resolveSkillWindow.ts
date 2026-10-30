import { drainStack } from "../effects/resolver";
import { isAbilityPrepared, preparedAbilityKey, removePreparedAbility } from "../abilities/prepared";
import type { GameState } from "../state/gameState";
import { getCardById } from "../data/cards";
import { getSkillName } from "../data/skillLocale";
import { log } from "../reducer/utils";
import { lookupSkillById } from "./lookup";
import {
	collectEventAbilityGrantCandidates,
	eventGrantMatchesContext,
	executeAbilityGrant,
	canExecuteAbilityGrant,
} from "../abilities/executor";
import type { SkillContext } from "../data/skillTypes";
import type { EventName } from "./dsl/types";
export { isVoluntaryTrigger } from "./activationMode";
import {
	fireTriggerDecision,
	triggerDecisionFlag,
	type PendingTriggerInterrupt,
} from "../triggers/engine";

export type SkillWindowResume =
	| { readonly type: "none" }
	| { readonly type: "roll_dice" }
	| { readonly type: "prepare_physical_roll" }
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

function eventTargetIds(
	candidate: import("../abilities/executor").EventAbilityGrantCandidate,
	ctx: SkillContext,
): readonly string[] {
	const target = candidate.grant.activation.targeting;
	if (target?.targetType === "tgt_self") {
		const sourceId = candidate.source.sourceHeroId ?? candidate.source.sourceEnemyId;
		return sourceId ? [sourceId] : [];
	}
	if (candidate.source.sourceEnemyId && target?.affectObject === "obj_not_friend") {
		if (ctx.targetHeroIds?.length) return ctx.targetHeroIds;
		return ctx.sourceHeroId ? [ctx.sourceHeroId] : [];
	}
	if (target?.targetType === "tgt_enemy" || target?.affectObject === "obj_not_friend")
		return ctx.targetEnemyIds ?? [];
	if (target?.affectScope === "scp_none") return [];
	return ctx.targetHeroIds?.length ? ctx.targetHeroIds : ctx.targetEnemyIds ?? [];
}

function shouldSkipGrant(candidate: import("../abilities/executor").EventAbilityGrantCandidate): boolean {
	// O combate de boss tem janelas e regras próprias em reducer/boss.ts.
	// Não permitir que os mesmos efeitos do catálogo rodem também aqui evita
	// duplicar Trono Vivo/Ascensão Final.
	if (candidate.source.kind === "boss" ||
		lookupSkillById(candidate.grant.abilityId)?.category === "boss_skill") return true;
	const item =
		candidate.source.kind === "item"
			? getCardById(candidate.source.cardId)
			: undefined;
	if (
		candidate.source.kind === "item" &&
		candidate.grant.id.startsWith("legacy:") &&
		ITEM_STATS_HANDLED_BY_EQUIPMENT.has(candidate.grant.abilityId) &&
		!(item?.type === "item" && item.useTiming)
	) {
		return true;
	}
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
	let current = state;
	const grantCandidates = collectEventAbilityGrantCandidates(
		current,
		request.event,
	);

	for (const candidate of grantCandidates) {
		if (shouldSkipGrant(candidate)) continue;
		if (!eventGrantMatchesContext(candidate, request.event, ctx)) continue;
		const targetIds = eventTargetIds(candidate, ctx);
		if (
			canExecuteAbilityGrant(
				current,
				candidate.source,
				candidate.grant,
				request.event,
				ctx,
				targetIds,
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
		const grantPreparedKey = candidate.source.sourceHeroId &&
			(candidate.source.kind === "hero" || candidate.source.kind === "item" || candidate.source.kind === "artifact")
			? preparedAbilityKey(candidate.source.kind, candidate.source.sourceHeroId,
				candidate.source.cardId, candidate.grant.abilityId,
				candidate.grant.id.startsWith("legacy:") ? undefined : candidate.grant.id)
			: null;
		if (candidate.grant.activation.decision === "optional" &&
			(!grantPreparedKey || !isAbilityPrepared(current, grantPreparedKey))) continue;
		current = executeAbilityGrant(current, {
			source: candidate.source,
			grant: candidate.grant,
			triggeredBy: request.event,
			targetIds,
			value: ctx.value,
			context: ctx,
		});
		if (grantPreparedKey && isAbilityPrepared(current, grantPreparedKey)) {
			current = log(removePreparedAbility(current, grantPreparedKey),
				`${getSkillName(candidate.grant.abilityId)} ativada automaticamente em ${request.event}.`);
		}
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

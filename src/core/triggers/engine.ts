import type { SkillRef } from "../data/cardTypes";
import { appendAlphaLog } from "../diagnostics/alphaLog";
import type { SkillContext, SkillDefinition } from "../data/skillTypes";
import type { Duration } from "../ecs/types";
import type { EventType } from "../events/types";
import { buildScriptCtx } from "../scripts/context";
import { cardName, skillName, scriptOf } from "../gameEngine";
import { evaluate } from "../skills/dsl/evaluate";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import type { EventName } from "../skills/dsl/types";

import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { isAbilityPrepared, preparedAbilityKey, removePreparedAbility } from "../abilities/prepared";
import { isVoluntaryTrigger } from "../skills/activationMode";
import { skillsOf } from "../gameEngine";
import { refRequirementMet } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { enemiesOf, heroesOf, withUnitStats, pendingTriggerInterruptOf } from "../state/access";
import { type FlagScope, scopedFlagOf, withScopedFlag } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
export type TriggerWindow =
	| "room_enter"
	| "paths_open"
	| "before_combat"
	| "round_start"
	| "hero_action"
	| "before_attack_roll"
	| "after_roll_before_result"
	| "before_damage"
	| "before_destroy"
	| "after_damage"
	| "on_destroy"
	| "combat_end"
	| "room_leave"
	| "dungeon_discard"
	| "round_end"
	| "entity_enter_play"
	| "hero_leave_play"
	| "targeted";

export type TriggerMode = "auto" | "prompt" | "passive";

export type TriggerSourceKind =
	| "hero"
	| "item"
	| "enemy"
	| "room"
	| "artifact"
	| "boss";

export interface TriggerSource {
	readonly kind: TriggerSourceKind;
	readonly cardId: string;
	readonly entityId?: string;
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
}

export interface TriggerCandidate {
	readonly definition: SkillDefinition;
	readonly ref: SkillRef;
	readonly event: EventName;
	readonly window: TriggerWindow;
	readonly mode: TriggerMode;
	readonly priority: number;
	readonly source: TriggerSource;
}

export interface TriggerDecision {
	readonly skillId: string;
	readonly event: EventName;
	readonly sourceCardId?: string;
	readonly sourceEntityId?: string;
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
	readonly targetHeroIds?: readonly string[];
	readonly targetEnemyIds?: readonly string[];
	readonly value?: number | string | null;
}

export interface PendingTriggerInterrupt extends TriggerDecision {
	readonly id: string;
	/** Identifica uma AbilityGrant vNext; ausente para TriggerCandidate legado. */
	readonly grantId?: string;
	readonly sourceKind: TriggerSourceKind;
	readonly sourceCardId: string;
	readonly window: TriggerWindow;
	readonly reason: string;
	readonly description: string;
}

const EVENT_TO_WINDOW: Record<EventName, TriggerWindow> = {
	evt_attack_declared: "before_attack_roll",
	evt_roll: "after_roll_before_result",
	evt_hit: "after_damage",
	evt_damage_dealt: "after_damage",
	evt_damage_taken: "before_damage",
	evt_would_be_destroyed: "before_destroy",
	evt_destroy: "on_destroy",
	evt_kill: "on_destroy",
	evt_combat_start: "before_combat",
	evt_combat_end: "combat_end",
	evt_round_start: "round_start",
	evt_round_end: "round_end",
	evt_room_reveal: "room_enter",
	evt_room_enter: "room_enter",
	evt_room_won: "combat_end",
	evt_room_leave: "room_leave",
	evt_dungeon_discard: "dungeon_discard",
	evt_enter_play: "entity_enter_play",
	evt_leave_play: "hero_leave_play",
	evt_targeted: "targeted",
};

export const TRIGGER_EVENT_TO_GAME_EVENT: Record<EventName, EventType> = {
	evt_attack_declared: "RollAboutToHappen",
	evt_roll: "RollResolved",
	evt_hit: "DamageDealt",
	evt_damage_dealt: "DamageDealt",
	evt_damage_taken: "DamageAboutToBeDealt",
	evt_would_be_destroyed: "EntityWouldBeDestroyed",
	evt_destroy: "EnemyDestroyed",
	evt_kill: "EnemyDestroyed",
	evt_combat_start: "CombatStarted",
	evt_combat_end: "CombatEnded",
	evt_round_start: "RoundStarted",
	evt_round_end: "RoundEnded",
	evt_room_reveal: "RoomEntered",
	evt_room_enter: "RoomEntered",
	evt_room_won: "RoomWon",
	evt_room_leave: "RoomLeft",
	evt_dungeon_discard: "DungeonCardDiscarded",
	evt_enter_play: "EntityEnteredPlay",
	evt_leave_play: "HeroFled",
	evt_targeted: "HeroTargeted",
};

const TRIGGER_EVENT_DURATION: Record<EventName, Duration> = {
	evt_attack_declared: { kind: "this_combat" },
	evt_roll: { kind: "this_combat" },
	evt_hit: { kind: "this_combat" },
	evt_damage_dealt: { kind: "this_combat" },
	evt_damage_taken: { kind: "this_combat" },
	evt_would_be_destroyed: { kind: "this_combat" },
	evt_destroy: { kind: "this_combat" },
	evt_kill: { kind: "this_combat" },
	evt_combat_start: { kind: "this_combat" },
	evt_combat_end: { kind: "this_combat" },
	evt_round_start: { kind: "this_combat" },
	evt_round_end: { kind: "this_combat" },
	evt_room_reveal: { kind: "permanent" },
	evt_room_enter: { kind: "permanent" },
	evt_room_won: { kind: "this_combat" },
	evt_room_leave: { kind: "permanent" },
	evt_dungeon_discard: { kind: "permanent" },
	evt_enter_play: { kind: "permanent" },
	evt_leave_play: { kind: "permanent" },
	evt_targeted: { kind: "permanent" },
};

export function gameEventForTriggerEvent(event: EventName): EventType {
	return TRIGGER_EVENT_TO_GAME_EVENT[event];
}

export function durationForTriggerEvent(event: EventName): Duration {
	return TRIGGER_EVENT_DURATION[event] ?? { kind: "permanent" };
}

function sourcePriority(kind: TriggerSourceKind): number {
	switch (kind) {
		case "room":
			return 10;
		case "artifact":
			return 20;
		case "item":
			return 30;
		case "hero":
			return 40;
		case "enemy":
			return 50;
		case "boss":
			return 60;
	}
}

function triggerWindow(def: SkillDefinition, event: EventName): TriggerWindow {
	return def.trigger?.window ?? EVENT_TO_WINDOW[event];
}

export function triggerMode(
	def: SkillDefinition,
	sourceKind?: TriggerSourceKind,
): TriggerMode {
	if (def.operate_type === "op_passive") return "passive";
	if (sourceKind === "hero" && def.operate_type === "op_triggered") {
		return "prompt";
	}
	return def.interrupt?.mode ?? "auto";
}

function inPlaySources(state: GameState, event: EventName): TriggerSource[] {
	const sources: TriggerSource[] = [];

	for (const hero of heroesOf(state).filter((h) => h.status === "active")) {
		if (!ActivationTracker.isDisabled(state, "hero", hero.id)) {
			sources.push({
				kind: "hero",
				cardId: hero.cardId,
				entityId: hero.id,
				sourceHeroId: hero.id,
			});
		}

		for (const itemId of Object.values(hero.activeItems)) {
			if (!itemId) continue;
			if (ActivationTracker.isDisabled(state, "item", `${hero.id}:${itemId}`)) {
				continue;
			}
			sources.push({
				kind: "item",
				cardId: itemId,
				entityId: itemId,
				sourceHeroId: hero.id,
			});
		}
	}

	const enemyFilter =
		event === "evt_destroy" || event === "evt_kill"
			? (enemy: { status: string }) =>
					enemy.status === "active" || enemy.status === "defeated"
			: (enemy: { status: string }) => enemy.status === "active";
	for (const enemy of enemiesOf(state).filter(enemyFilter)) {
		const kind = enemy.id === "boss" ? "boss" : "enemy";
		if (ActivationTracker.isDisabled(state, kind, enemy.id)) continue;
		sources.push({
			kind,
			cardId: enemy.cardId,
			entityId: enemy.id,
			sourceEnemyId: enemy.id,
		});
	}

	if (gameOf(state).currentRoom) {
		if (
			!ActivationTracker.isDisabled(state, "room", gameOf(state).currentRoom!.cardId)
		) {
			sources.push({
				kind: "room",
				cardId: gameOf(state).currentRoom!.cardId,
				entityId: gameOf(state).currentRoom!.cardId,
			});
		}
	}

	for (const artifact of gameOf(state).groupArtifacts) {
		if (ActivationTracker.isDisabled(state, "artifact", artifact.cardId)) {
			continue;
		}
		sources.push({
			kind: "artifact",
			cardId: artifact.cardId,
			entityId: artifact.cardId,
			sourceHeroId: artifact.carriedBy ?? undefined,
		});
	}

	return sources;
}

export function collectTriggerCandidates(engine: GameEngine,
	state: GameState,
	event: EventName,
): TriggerCandidate[] {
	const candidates: TriggerCandidate[] = [];

	for (const source of inPlaySources(state, event)) {
		for (const { def, ref } of skillsOf(engine, source.cardId)) {
			if (!refRequirementMet(engine, state, ref.requiresAwakening))
				continue;
			if (def.operate_type !== "op_triggered") continue;
			if (def.trigger?.event !== event) continue;
			candidates.push({
				definition: def,
				ref,
				event,
				window: triggerWindow(def, event),
				mode: triggerMode(def, source.kind),
				priority: def.interrupt?.priority ?? sourcePriority(source.kind),
				source,
			});
		}
	}

	return candidates.sort((a, b) => {
		const byPriority = a.priority - b.priority;
		if (byPriority !== 0) return byPriority;
		return `${a.source.kind}:${a.source.entityId ?? a.source.cardId}:${a.definition.id}`.localeCompare(
			`${b.source.kind}:${b.source.entityId ?? b.source.cardId}:${b.definition.id}`,
		);
	});
}

export function collectPromptTriggers(engine: GameEngine,
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): TriggerCandidate[] {
	return collectTriggerCandidates(engine, state, event).filter(
		(candidate) =>
			candidate.mode === "prompt" && candidateCanFire(engine, state, candidate, ctx),
	);
}

export function hasPromptTriggers(engine: GameEngine,
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): boolean {
	return collectPromptTriggers(engine, state, event, ctx).length > 0;
}

export function guardPassed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	const cooldown = skill.cooldown;
	if (!cooldown) return true;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	switch (cooldown.scope) {
		case "game":
			return !gameOf(state).oncePer?.game?.[key];
		case "room":
			return !scopedFlagOf(state, "room", "oncePer", key);
		case "combat":
			return !scopedFlagOf(state, "combat", "oncePer", key);
		case "round":
			return !scopedFlagOf(state, "round", "oncePer", key);
	}
}

export function isSkillGuardConsumed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	return !guardPassed(state, skill, sourceHeroId);
}

export function markSkillGuardUsed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): GameState {
	const cooldown = skill.cooldown;
	if (!cooldown) return state;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (cooldown.scope === "room") {
		return withScopedFlag(state, "room", "oncePer", key);
	}
	if (cooldown.scope === "game") {
		return withGame(state, (prevGame) => ({ ...prevGame, oncePer: {
				...gameOf(state).oncePer,
				game: { ...(gameOf(state).oncePer?.game ?? {}), [key]: true },
			} }));
	}
	if (gameOf(state).combat) {
		return withScopedFlag(state, cooldown.scope as FlagScope, "oncePer", key);
	}
	return state;
}

function triggerContextMatches(
	candidate: TriggerCandidate,
	ctx: SkillContext,
): boolean {
	const { event, source } = candidate;

	if (event === "evt_attack_declared" || event === "evt_roll") {
		if (source.sourceHeroId && source.sourceHeroId !== ctx.sourceHeroId)
			return false;
		if (source.sourceEnemyId && source.sourceEnemyId !== ctx.sourceEnemyId)
			return false;
	}

	// Eventos pós-dano pertencem ao agressor; caso contrário, um poder de um
	// segundo herói poderia reagir ao dano causado pelo primeiro.
	if (event === "evt_damage_dealt" || event === "evt_kill") {
		if (source.sourceHeroId && source.sourceHeroId !== ctx.sourceHeroId)
			return false;
		if (source.sourceEnemyId && source.sourceEnemyId !== ctx.sourceEnemyId)
			return false;
	}

	// Acerto e destruição pertencem à criatura atingida/derrotada. Salas e
	// artefatos permanecem globais e não possuem sourceEnemyId.
	if (
		event === "evt_damage_taken" ||
		event === "evt_would_be_destroyed" ||
		event === "evt_targeted"
	) {
		if (
			source.sourceHeroId &&
			candidate.definition.target_type === "tgt_self" &&
			!ctx.targetHeroIds?.includes(source.sourceHeroId)
		)
			return false;
		if (
			source.sourceEnemyId &&
			event === "evt_damage_taken" &&
			ctx.targetHeroIds?.length
		)
			return false;
		if (
			source.sourceEnemyId &&
			!ctx.targetEnemyIds?.includes(source.sourceEnemyId)
		)
			return false;
	}

	if (event === "evt_hit" || event === "evt_destroy") {
		if (source.sourceHeroId && source.sourceHeroId !== ctx.sourceHeroId)
			return false;
		if (
			source.sourceEnemyId &&
			!ctx.targetEnemyIds?.includes(source.sourceEnemyId)
		)
			return false;
	}

	if (event === "evt_leave_play") {
		if (source.sourceHeroId && source.sourceHeroId !== ctx.sourceHeroId)
			return false;
		if (source.sourceEnemyId && source.sourceEnemyId !== ctx.sourceEnemyId)
			return false;
	}

	return true;
}

function resolveSkillContext(
	candidate: TriggerCandidate,
	ctx: SkillContext,
): SkillContext {
	return {
		...ctx,
		triggeredBy: candidate.event,
		sourceCardId: candidate.source.cardId,
		sourceEntityId: candidate.source.entityId,
		sourceHeroId: candidate.source.sourceHeroId ?? ctx.sourceHeroId,
		sourceEnemyId: candidate.source.sourceEnemyId ?? ctx.sourceEnemyId,
		skillId: candidate.definition.id,
		value: ctx.value ?? candidate.ref.params?.value ?? null,
	};
}

function resolveSkillParams(
	candidate: TriggerCandidate,
): Record<string, unknown> {
	return {
		...(candidate.definition.params ?? {}),
		...(candidate.ref.params ?? {}),
	};
}

export function candidateCanFire(engine: GameEngine,
	state: GameState,
	candidate: TriggerCandidate,
	ctx: SkillContext,
): boolean {
	if (!triggerContextMatches(candidate, ctx)) return false;
	if (
		!guardPassed(state, candidate.definition, candidate.source.sourceHeroId)
	) {
		return false;
	}
	const hpCost = candidate.definition.cost?.hp ?? 0;
	if (hpCost > 0 && candidate.source.sourceHeroId) {
		const hero = heroesOf(state).find(
			(entry) => entry.id === candidate.source.sourceHeroId,
		);
		if (!hero || hero.currentLife <= hpCost) return false;
	}

	if (
		candidate.definition.conditions &&
		candidate.definition.conditions.length > 0
	) {
		const evalCtx = buildScriptCtx(engine,
			state,
			resolveSkillContext(candidate, ctx),
			resolveSkillParams(candidate),
		);
		return candidate.definition.conditions.every((condition) =>
			resolveCondition(condition, evalCtx),
		);
	}

	return true;
}

export function executeTriggerCandidate(engine: GameEngine,
	state: GameState,
	candidate: TriggerCandidate,
	ctx: SkillContext,
): GameState {
	let current = state;
	const hpCost = candidate.definition.cost?.hp ?? 0;
	if (hpCost > 0 && candidate.source.sourceHeroId) {
		const hero = heroesOf(current).find(
			(entry) => entry.id === candidate.source.sourceHeroId,
		);
		if (!hero || hero.currentLife <= hpCost) return state;
		current = withUnitStats(current, hero.id, {
			currentLife: hero.currentLife - hpCost,
		});
	}

	if (candidate.definition.effect) {
		const resolvedCtx = resolveSkillContext(candidate, ctx);
		const params = resolveSkillParams(candidate);
		const evalCtx = buildScriptCtx(engine, current, resolvedCtx, params);
		current = evaluate(candidate.definition.effect, evalCtx);
	} else if (candidate.definition.script) {
		const fn = scriptOf(engine, `${candidate.definition.script}.run`);
		if (fn) {
			const resolvedCtx = resolveSkillContext(candidate, ctx);
			const params = resolveSkillParams(candidate);
			const scriptCtx = buildScriptCtx(engine, current, resolvedCtx, params);
			current = fn(scriptCtx);
		}
	}

	return appendAlphaLog(markSkillGuardUsed(
		current,
		candidate.definition,
		candidate.source.sourceHeroId,
	), `Gatilho ${skillName(engine, candidate.definition.id)} ativado por ${cardName(engine, candidate.source.cardId)} (${candidate.source.sourceHeroId ?? candidate.source.sourceEnemyId ?? "grupo"}) em ${candidate.event}; parâmetros ${JSON.stringify(resolveSkillParams(candidate))}.`);
}

function candidateMatchesDecision(
	candidate: TriggerCandidate,
	decision: TriggerDecision,
): boolean {
	if (candidate.definition.id !== decision.skillId) return false;
	if (candidate.event !== decision.event) return false;
	if (
		decision.sourceCardId &&
		candidate.source.cardId !== decision.sourceCardId
	) {
		return false;
	}
	if (
		decision.sourceEntityId &&
		candidate.source.entityId !== decision.sourceEntityId
	) {
		return false;
	}
	if (
		decision.sourceHeroId &&
		candidate.source.sourceHeroId &&
		candidate.source.sourceHeroId !== decision.sourceHeroId
	) {
		return false;
	}
	if (
		decision.sourceEnemyId &&
		candidate.source.sourceEnemyId &&
		candidate.source.sourceEnemyId !== decision.sourceEnemyId
	) {
		return false;
	}
	return true;
}

function interruptId(candidate: TriggerCandidate, ctx: SkillContext): string {
	return [
		candidate.event,
		candidate.source.kind,
		candidate.source.entityId ?? candidate.source.cardId,
		candidate.definition.id,
		ctx.sourceHeroId ?? "",
		ctx.sourceEnemyId ?? "",
		ctx.targetHeroIds?.join(",") ?? "",
		ctx.targetEnemyIds?.join(",") ?? "",
		ctx.round ?? "",
	].join(":");
}

export function triggerDecisionFlag(interruptId: string): string {
	return `triggerInterruptResolved::${interruptId}`;
}

export function createPendingTriggerInterrupt(
	candidate: TriggerCandidate,
	ctx: SkillContext,
): PendingTriggerInterrupt {
	const resolvedCtx = resolveSkillContext(candidate, ctx);
	return {
		id: interruptId(candidate, resolvedCtx),
		skillId: candidate.definition.id,
		event: candidate.event,
		window: candidate.window,
		sourceKind: candidate.source.kind,
		sourceCardId: candidate.source.cardId,
		sourceEntityId: candidate.source.entityId,
		sourceHeroId: resolvedCtx.sourceHeroId,
		sourceEnemyId: resolvedCtx.sourceEnemyId,
		targetHeroIds: resolvedCtx.targetHeroIds,
		targetEnemyIds: resolvedCtx.targetEnemyIds,
		value: resolvedCtx.value ?? null,
		reason:
			candidate.definition.interrupt?.prompt ??
			"Esta habilidade pode ser usada nesta fase.",
		description: candidate.definition.id,
	};
}

export function fireTriggerDecision(engine: GameEngine,
	state: GameState,
	decision: TriggerDecision,
): GameState {
	const candidate = collectTriggerCandidates(engine, state, decision.event).find((c) =>
		candidateMatchesDecision(c, decision),
	);
	if (!candidate) return state;

	const ctx: SkillContext = {
		triggeredBy: decision.event,
		skillId: decision.skillId,
		sourceCardId: decision.sourceCardId,
		sourceEntityId: decision.sourceEntityId,
		sourceHeroId: decision.sourceHeroId,
		sourceEnemyId: decision.sourceEnemyId,
		targetHeroIds: decision.targetHeroIds,
		targetEnemyIds: decision.targetEnemyIds,
		value: decision.value ?? null,
	};
	if (!candidateCanFire(engine, state, candidate, ctx)) return state;
	return executeTriggerCandidate(engine, state, candidate, ctx);
}

export function fireTrigger(engine: GameEngine,
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): GameState {
	const candidates = collectTriggerCandidates(engine, state, event);
	let current = state;
	if (pendingTriggerInterruptOf(current)) return current;

	for (const candidate of candidates) {
		if (isVoluntaryTrigger(candidate.definition, candidate.source.kind, event)) {
			if (!candidateCanFire(engine, current, candidate, ctx)) continue;
			const sourceHeroId = candidate.source.sourceHeroId;
			if (!sourceHeroId ||
				(candidate.source.kind !== "hero" && candidate.source.kind !== "item" && candidate.source.kind !== "artifact")) continue;
			const key = preparedAbilityKey(candidate.source.kind, sourceHeroId,
				candidate.source.cardId, candidate.definition.id);
			if (!isAbilityPrepared(current, key)) continue;
			current = removePreparedAbility(executeTriggerCandidate(engine, current, candidate, ctx), key);
			continue;
		}
		if (candidate.definition.operate_type === "op_passive") continue;
		if (!candidateCanFire(engine, current, candidate, ctx)) continue;

		current = executeTriggerCandidate(engine, current, candidate, ctx);
	}

	return current;
}

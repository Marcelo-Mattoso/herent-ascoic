// Motor central de triggers.
// A regra de "quando uma habilidade em jogo reage a uma fase/evento" mora aqui.
// Os reducers e o event bus podem chamar esta camada sem conhecer origem da carta.

import type { SkillRef } from "../data/cardTypes";
import type { SkillContext, SkillDefinition } from "../data/skillTypes";
import type { Duration } from "../ecs/types";
import type { EventType } from "../events/types";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import { evaluate } from "../skills/dsl/evaluate";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import type { EventName } from "../skills/dsl/types";
import { cardSkills } from "../skills/lookup";
import type { GameState } from "../state/gameState";

export type TriggerWindow =
	| "room_enter"
	| "paths_open"
	| "before_combat"
	| "round_start"
	| "hero_action"
	| "before_attack_roll"
	| "after_roll_before_result"
	| "before_damage"
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
	evt_destroy: "on_destroy",
	evt_kill: "on_destroy",
	evt_combat_start: "before_combat",
	evt_combat_end: "combat_end",
	evt_round_start: "round_start",
	evt_round_end: "round_end",
	evt_room_reveal: "room_enter",
	evt_room_enter: "room_enter",
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
	evt_destroy: "EnemyDestroyed",
	evt_kill: "EnemyDestroyed",
	evt_combat_start: "CombatStarted",
	evt_combat_end: "CombatEnded",
	evt_round_start: "RoundStarted",
	evt_round_end: "RoundEnded",
	evt_room_reveal: "RoomEntered",
	evt_room_enter: "RoomEntered",
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
	evt_destroy: { kind: "this_combat" },
	evt_kill: { kind: "this_combat" },
	evt_combat_start: { kind: "this_combat" },
	evt_combat_end: { kind: "this_combat" },
	evt_round_start: { kind: "this_combat" },
	evt_round_end: { kind: "this_combat" },
	evt_room_reveal: { kind: "permanent" },
	evt_room_enter: { kind: "permanent" },
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

	for (const hero of state.heroes.filter((h) => h.status === "active")) {
		sources.push({
			kind: "hero",
			cardId: hero.cardId,
			entityId: hero.id,
			sourceHeroId: hero.id,
		});

		for (const itemId of Object.values(hero.activeItems)) {
			if (!itemId) continue;
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
	for (const enemy of state.activeEnemies.filter(enemyFilter)) {
		sources.push({
			kind: enemy.id === "boss" ? "boss" : "enemy",
			cardId: enemy.cardId,
			entityId: enemy.id,
			sourceEnemyId: enemy.id,
		});
	}

	if (state.currentRoom) {
		sources.push({
			kind: "room",
			cardId: state.currentRoom.cardId,
			entityId: state.currentRoom.cardId,
		});
	}

	for (const artifact of state.groupArtifacts) {
		sources.push({
			kind: "artifact",
			cardId: artifact.cardId,
			entityId: artifact.cardId,
			sourceHeroId: artifact.carriedBy ?? undefined,
		});
	}

	return sources;
}

export function collectTriggerCandidates(
	state: GameState,
	event: EventName,
): TriggerCandidate[] {
	const candidates: TriggerCandidate[] = [];

	for (const source of inPlaySources(state, event)) {
		for (const { def, ref } of cardSkills(source.cardId)) {
			if (ref.requiresAwakening && state.despertar !== 4) continue;
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

export function collectPromptTriggers(
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): TriggerCandidate[] {
	return collectTriggerCandidates(state, event).filter(
		(candidate) =>
			candidate.mode === "prompt" && candidateCanFire(state, candidate, ctx),
	);
}

export function hasPromptTriggers(
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): boolean {
	return collectPromptTriggers(state, event, ctx).length > 0;
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
			return !state.oncePer?.game?.[key];
		case "room":
			return !state.combat?.oncePer?.room?.[key];
		case "combat":
			return !state.combat?.oncePer?.combat?.[key];
		case "round":
			return !state.combat?.oncePer?.round?.[key];
	}
}

export function isSkillGuardConsumed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	return !guardPassed(state, skill, sourceHeroId);
}

function markGuardUsed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): GameState {
	const cooldown = skill.cooldown;
	if (!cooldown) return state;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (cooldown.scope === "game") {
		return {
			...state,
			oncePer: {
				...state.oncePer,
				game: { ...(state.oncePer?.game ?? {}), [key]: true },
			},
		};
	}
	if (state.combat) {
		const scope = cooldown.scope as "room" | "combat" | "round";
		return {
			...state,
			combat: {
				...state.combat,
				oncePer: {
					...(state.combat.oncePer ?? {}),
					[scope]: { ...(state.combat.oncePer?.[scope] ?? {}), [key]: true },
				},
			},
		};
	}
	return state;
}

function triggerContextMatches(
	candidate: TriggerCandidate,
	ctx: SkillContext,
): boolean {
	const { event, source } = candidate;

	if (
		event === "evt_attack_declared" &&
		source.sourceHeroId &&
		ctx.sourceHeroId &&
		source.sourceHeroId !== ctx.sourceHeroId
	) {
		return false;
	}

	if (
		event === "evt_attack_declared" &&
		source.sourceEnemyId &&
		ctx.sourceEnemyId &&
		source.sourceEnemyId !== ctx.sourceEnemyId
	) {
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

function candidateCanFire(
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

	if (
		candidate.definition.conditions &&
		candidate.definition.conditions.length > 0
	) {
		const evalCtx = buildScriptCtx(
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

function executeTriggerCandidate(
	state: GameState,
	candidate: TriggerCandidate,
	ctx: SkillContext,
): GameState {
	let current = state;

	if (candidate.definition.effect) {
		const resolvedCtx = resolveSkillContext(candidate, ctx);
		const params = resolveSkillParams(candidate);
		const evalCtx = buildScriptCtx(current, resolvedCtx, params);
		current = evaluate(candidate.definition.effect, evalCtx);
	} else if (candidate.definition.script) {
		const fn = getScript(`${candidate.definition.script}.run`);
		if (fn) {
			const resolvedCtx = resolveSkillContext(candidate, ctx);
			const params = resolveSkillParams(candidate);
			const scriptCtx = buildScriptCtx(current, resolvedCtx, params);
			current = fn(scriptCtx);
		}
	}

	return markGuardUsed(
		current,
		candidate.definition,
		candidate.source.sourceHeroId,
	);
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

export function fireTriggerDecision(
	state: GameState,
	decision: TriggerDecision,
): GameState {
	const candidate = collectTriggerCandidates(state, decision.event).find((c) =>
		candidateMatchesDecision(c, decision),
	);
	if (!candidate) return state;

	const ctx: SkillContext = {
		triggeredBy: decision.event,
		skillId: decision.skillId,
		sourceHeroId: decision.sourceHeroId,
		sourceEnemyId: decision.sourceEnemyId,
		targetHeroIds: decision.targetHeroIds,
		targetEnemyIds: decision.targetEnemyIds,
		value: decision.value ?? null,
	};
	if (!candidateCanFire(state, candidate, ctx)) return state;
	return executeTriggerCandidate(state, candidate, ctx);
}

export function fireTrigger(
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): GameState {
	const candidates = collectTriggerCandidates(state, event);
	let current = state;
	if (current.pendingTriggerInterrupt) return current;

	for (const candidate of candidates) {
		if (candidate.mode === "prompt") {
			if (!candidateCanFire(current, candidate, ctx)) continue;
			const pending = createPendingTriggerInterrupt(candidate, ctx);
			if (current.flags[triggerDecisionFlag(pending.id)]) continue;
			return {
				...current,
				pendingTriggerInterrupt: pending,
			};
		}
		if (candidate.mode !== "auto") continue;
		if (!candidateCanFire(current, candidate, ctx)) continue;

		current = executeTriggerCandidate(current, candidate, ctx);
	}

	return current;
}

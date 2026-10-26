// Executor vNext: separa o efeito da ability do ciclo de vida da fonte.

import { cardAbilityGrants, lookupAbilityById } from "../data/abilities";
import { getCardById } from "../data/cards";
import { lookupSkillById } from "../skills/lookup";
import { guardPassed, markSkillGuardUsed } from "../triggers/engine";
import { emit } from "../events/bus";
import type { AbilityGrant } from "../data/abilityTypes";
import { drainStack } from "../effects/resolver";
import { findHeroItemLocation, removeHeroItem } from "../rules/itemEffects";
import { destructionPreventionFlag } from "../rules/destruction";
import { awakeningRequirementMet } from "../rules/awakening";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import { evaluate } from "../skills/dsl/evaluate";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import {
	resolveManualSkillTarget,
	type TargetingDefinition,
} from "../skills/targeting";
import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { log } from "../reducer/utils";
import type { SkillContext } from "../data/skillTypes";
import type { EventName } from "../skills/dsl/types";

export type AbilityGrantSourceKind =
	| "hero"
	| "item"
	| "enemy"
	| "room"
	| "artifact"
	| "boss";

export interface AbilityGrantSource {
	readonly kind: AbilityGrantSourceKind;
	readonly cardId: string;
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
}

export interface AbilityGrantExecution {
	readonly source: AbilityGrantSource;
	readonly grant: AbilityGrant;
	readonly triggeredBy: string;
	readonly targetIds?: readonly string[];
	readonly value?: number | string | null;
	readonly context?: SkillContext;
}

export interface EventAbilityGrantCandidate {
	readonly source: AbilityGrantSource;
	readonly grant: AbilityGrant;
}

export function abilityGrantLockId(
	source: AbilityGrantSource,
	grant: AbilityGrant,
): string {
	return `${source.sourceHeroId ?? source.sourceEnemyId ?? "group"}:${source.cardId}:${grant.id}`;
}

function sourceKind(source: AbilityGrantSource) {
	return source.kind === "hero" ? "card" : source.kind === "boss" ? "boss" : source.kind;
}

function targeting(grant: AbilityGrant): TargetingDefinition {
	const target = grant.activation.targeting;
	const ability = lookupAbilityById(grant.abilityId);
	return {
		effect: ability?.effect,
		script: ability?.script,
		target_type: target?.targetType ?? "tgt_self",
		affect_scope: target?.affectScope ?? "scp_single",
		affect_object: target?.affectObject ?? "obj_friend",
	};
}

function defaultTargetIds(
	source: AbilityGrantSource,
	grant: AbilityGrant,
	targetIds: readonly string[] | undefined,
): readonly string[] {
	if (targetIds?.length) return targetIds;
	if (grant.activation.targeting?.targetType === "tgt_self") {
		const id = source.sourceHeroId ?? source.sourceEnemyId;
		return id ? [id] : [];
	}
	return [];
}

export function canExecuteAbilityGrant(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
	triggeredBy: string,
	context?: SkillContext,
	targetIds?: readonly string[],
): string | null {
	const ability = lookupAbilityById(grant.abilityId);
	if (!ability) return "Habilidade inexistente.";
	if (ability.script && !getScript(`${ability.script}.run`)) return "Script da habilidade não encontrado.";
	if (!ability.effect && !ability.script) return "Habilidade sem efeito implementado.";
	const card = getCardById(source.cardId);
	if (!card) return "Carta de origem inexistente.";
	if (source.kind === "hero" &&
		!state.heroes.some((hero) => hero.id === source.sourceHeroId &&
			hero.cardId === source.cardId && hero.status === "active"))
		return "Herói de origem não está em jogo.";
	if (source.kind === "item") {
		const owner = state.heroes.find((hero) => hero.id === source.sourceHeroId && hero.status === "active");
		const equipped = owner && Object.values(owner.activeItems).includes(source.cardId);
		const mysticDrawReward = state.status === "REWARD_PHASE" &&
			grant.abilityId === "item_skill_mystic_draw" &&
			state.pendingRewards.some((reward) => reward.type === "item" && reward.cardId === source.cardId);
		if (!equipped && !mysticDrawReward) return "Item não equipado por este herói.";
	}
	if (source.kind === "artifact" &&
		!state.groupArtifacts.some((artifact) => artifact.cardId === source.cardId))
		return "Artefato não está em jogo.";
	if (source.sourceHeroId && (grant.activation.cost?.hp ?? 0) > 0) {
		const hero = state.heroes.find((entry) => entry.id === source.sourceHeroId);
		if (!hero || hero.currentLife <= (grant.activation.cost?.hp ?? 0))
			return "Vida insuficiente para ativar a habilidade.";
	}
	if (!awakeningRequirementMet(state.despertar, grant.requiresAwakening))
		return "Esta concessão exige Despertar 4.";
	if (source.sourceHeroId && ActivationTracker.isDisabled(state, "hero", source.sourceHeroId))
		return "A fonte está incapacitada.";
	if (source.kind === "item" && source.sourceHeroId &&
		ActivationTracker.isDisabled(state, "item", `${source.sourceHeroId}:${source.cardId}`))
		return "Este item está exaurido.";
	if (grant.id.startsWith("legacy:")) {
		const definition = lookupSkillById(grant.abilityId);
		if (!definition || !guardPassed(state, definition, source.sourceHeroId))
			return "O limite de uso deste efeito já foi atingido.";
	}
	if (
		grant.activation.kind === "event" &&
		grant.activation.event !== triggeredBy
	)
		return "Esta concessão não pode ser usada nesta janela.";
	if (
		grant.activation.limit?.maxUses === 1 &&
		ActivationTracker.isDisabled(
			state,
			sourceKind(source),
			abilityGrantLockId(source, grant),
		)
	)
		return "Esta concessão já foi usada neste escopo.";
	if (grant.activation.conditions?.length && context) {
		const params = { ...ability?.defaultParams, ...grant.params };
		const evalCtx = buildScriptCtx(state, {
			...context, sourceHeroId: source.sourceHeroId ?? context.sourceHeroId,
			sourceEnemyId: source.sourceEnemyId ?? context.sourceEnemyId,
			skillId: grant.abilityId,
		}, params);
		if (!grant.activation.conditions.every((condition) => resolveCondition(condition, evalCtx)))
			return "Condições da concessão não atendidas.";
	}
	if (targetIds) {
		const targetType = grant.activation.targeting?.targetType;
		if ((targetType === "tgt_enemy" || targetType === "tgt_target" || targetType === "tgt_others") &&
			targetIds.length === 0)
			return "Esta habilidade precisa de um alvo válido.";
		if (targetIds.some((id) => !state.heroes.some((hero) => hero.id === id && hero.status === "active") &&
			!state.activeEnemies.some((enemy) => enemy.id === id && enemy.status === "active")))
			return "Alvo inválido para esta habilidade.";
		if (targetType === "tgt_enemy" && targetIds.some((id) =>
			!state.activeEnemies.some((enemy) => enemy.id === id && enemy.status === "active")))
			return "Esta habilidade exige uma criatura como alvo.";
	}
	return null;
}

function consumeSource(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
): GameState {
	if (grant.activation.consumeSource === "none") return state;
	if (source.kind !== "item" || !source.sourceHeroId) return state;
	const owner = state.heroes.find((hero) => hero.id === source.sourceHeroId);
	const owned = owner ? findHeroItemLocation(owner, source.cardId) !== null : false;
	const withoutItem = owned
		? removeHeroItem(state, source.sourceHeroId, source.cardId)
		: state;
	const pendingIndex = owned ? -1 : state.pendingRewards.findIndex(
		(reward) => reward.type === "item" && reward.cardId === source.cardId,
	);
	const withoutPending = pendingIndex < 0
		? withoutItem
		: {
			...withoutItem,
			pendingRewards: state.pendingRewards.filter((_, index) => index !== pendingIndex),
		};
	const pile = grant.activation.consumeSource === "remove" ? "removed" : "discarded";
	return {
		...withoutPending,
		decks: {
			...withoutPending.decks,
			itemDeck: {
				...withoutPending.decks.itemDeck,
				[pile]: [...withoutPending.decks.itemDeck[pile], source.cardId],
			},
		},
	};
}

function markGrantUsed(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
): GameState {
	if (grant.id.startsWith("legacy:")) {
		const definition = lookupSkillById(grant.abilityId);
		return definition ? markSkillGuardUsed(state, definition, source.sourceHeroId) : state;
	}
	const limit = grant.activation.limit;
	if (!limit || limit.maxUses !== 1) return state;
	return ActivationTracker.disable(state, {
		kind: sourceKind(source),
		id: abilityGrantLockId(source, grant),
		scope: limit.scope,
		sourceId: source.sourceHeroId ?? source.sourceEnemyId,
		reason: `usou ${grant.id}`,
	});
}

function effectPreventsDestruction(
	effects: readonly import("../skills/dsl/types").EffectNode[] | undefined,
): boolean {
	if (!effects) return false;
	return effects.some((effect) => {
		if (effect.kind === "i_prevent_destroy") return true;
		if (effect.kind === "i_if")
			return (
				effectPreventsDestruction(effect.then) ||
				effectPreventsDestruction(effect.else)
			);
		if (effect.kind === "i_for_each") return effectPreventsDestruction(effect.do);
		return false;
	});
}

/** Executa custo, descarte/remoção, effect/script e limite da concessão. */
export function executeAbilityGrant(
	state: GameState,
	request: AbilityGrantExecution,
): GameState {
	const { source, grant, triggeredBy } = request;
	const ability = lookupAbilityById(grant.abilityId);
	if (!ability) return log(state, `[AVISO] Ability não encontrada: ${grant.abilityId}`);
	const requestedTargetIds = defaultTargetIds(source, grant, request.targetIds);
	const context: SkillContext = request.context ?? {
		triggeredBy,
		sourceHeroId: source.sourceHeroId,
		sourceEnemyId: source.sourceEnemyId,
		targetHeroIds: requestedTargetIds.filter((id) => state.heroes.some((hero) => hero.id === id)),
		targetEnemyIds: requestedTargetIds.filter((id) => state.activeEnemies.some((enemy) => enemy.id === id)),
		value: request.value,
	};
	const unavailable = canExecuteAbilityGrant(state, source, grant, triggeredBy, context, requestedTargetIds);
	if (unavailable) return log(state, `[AVISO] ${unavailable}`);
	const script = ability.script ? getScript(`${ability.script}.run`) : null;
	if (ability.script && !script)
		return log(state, `[SCRIPT NÃO ENCONTRADO: ${ability.script}.run]`);
	if (!ability.effect && !script)
		return log(state, `[AVISO] Ability sem implementação: ${ability.id}`);
	const hpCost = grant.activation.cost?.hp ?? 0;
	if (hpCost > 0 && source.sourceHeroId) {
		const hero = state.heroes.find((entry) => entry.id === source.sourceHeroId);
		if (!hero || hero.currentLife <= hpCost)
			return log(state, "[AVISO] Vida insuficiente para ativar a habilidade.");
	}

	const targetIds = requestedTargetIds;
	const params = { ...ability.defaultParams, ...grant.params };
	const value = request.value ?? (params.value as number | string | null | undefined) ?? null;
	const parameterValue = triggeredBy === "manual" && request.value != null
		? request.value
		: (params.value as number | string | null | undefined) ?? request.value ?? null;
	let next = state;
	if (triggeredBy === "manual" && source.sourceHeroId)
		({ state: next } = emit(next, { type: "SkillUsed", payload: {
			sourceId: source.sourceHeroId, skillId: ability.id,
		} }));
	next = consumeSource(next, source, grant);
	if (hpCost > 0 && source.sourceHeroId) {
		const hero = next.heroes.find((entry) => entry.id === source.sourceHeroId);
		if (!hero || hero.currentLife <= hpCost)
			return log(state, "[AVISO] Vida insuficiente para ativar a habilidade.");
		next = {
			...next,
			heroes: next.heroes.map((entry) =>
				entry.id === hero.id ? { ...entry, currentLife: entry.currentLife - hpCost } : entry,
			),
		};
	}

	const skillCtx = {
		...context,
		triggeredBy,
		sourceHeroId: source.sourceHeroId,
		sourceEnemyId: source.sourceEnemyId,
		targetHeroIds: targetIds.filter((id) => next.heroes.some((hero) => hero.id === id)),
		targetEnemyIds: targetIds.filter((id) =>
			next.activeEnemies.some((enemy) => enemy.id === id),
		),
		skillId: ability.id,
		value,
	};
	const ctx = buildScriptCtx(next, skillCtx, { ...params, value: parameterValue });
	if (ability.effect) next = evaluate(ability.effect, ctx);
	if (ability.script) {
		next = script!(ctx);
	}
	next = drainStack(next);
	// Antes da destruição, i_prevent_destroy não pode curar uma entidade que
	// ainda não recebeu o dano. Em vez disso, a aplicação pendente consome esta
	// marca e preserva 1 ponto de vida.
	if (
		triggeredBy === "evt_would_be_destroyed" &&
		effectPreventsDestruction(ability.effect)
	) {
		const targetId = targetIds[0];
		if (targetId) {
			next = {
				...next,
				flags: {
					...next.flags,
					[destructionPreventionFlag(targetId)]: true,
				},
			};
		}
	}
	next = markGrantUsed(next, source, grant);
	if (grant.activation.actionCost === "consume_hero_action" && source.sourceHeroId) {
		next = ActivationTracker.endHeroTurn(next, source.sourceHeroId);
	}
	return next;
}

export function resolveManualGrantTarget(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
	targetIds?: readonly string[],
) {
	const sourceId = source.sourceHeroId ?? source.sourceEnemyId;
	if (!sourceId)
		return { kind: "unavailable" as const, reason: "Fonte sem entidade." };
	return resolveManualSkillTarget(state, targeting(grant), sourceId, targetIds);
}

function addEventGrants(
	candidates: EventAbilityGrantCandidate[],
	source: AbilityGrantSource,
	event: EventName,
): void {
	for (const grant of cardAbilityGrants(source.cardId)) {
		if (grant.activation.kind !== "event" || grant.activation.event !== event)
			continue;
		candidates.push({ source, grant });
	}
}

/** Descoberta única de grants explícitos e SkillRefs normalizadas. */
export function collectEventAbilityGrantCandidates(
	state: GameState,
	event: EventName,
): readonly EventAbilityGrantCandidate[] {
	const candidates: EventAbilityGrantCandidate[] = [];
	for (const hero of state.heroes.filter((entry) => entry.status === "active")) {
		addEventGrants(
			candidates,
			{ kind: "hero", cardId: hero.cardId, sourceHeroId: hero.id },
			event,
		);
		for (const itemId of new Set(Object.values(hero.activeItems))) {
			if (!itemId) continue;
			addEventGrants(
				candidates,
				{ kind: "item", cardId: itemId, sourceHeroId: hero.id },
				event,
			);
		}
	}
	for (const enemy of state.activeEnemies.filter((entry) =>
		entry.status === "active" ||
		((event === "evt_destroy" || event === "evt_kill") && entry.status === "defeated"),
	)) {
		addEventGrants(
			candidates,
			{
				kind: enemy.id === "boss" ? "boss" : "enemy",
				cardId: enemy.cardId,
				sourceEnemyId: enemy.id,
			},
			event,
		);
	}
	if (state.currentRoom) {
		addEventGrants(candidates, { kind: "room", cardId: state.currentRoom.cardId }, event);
	}
	for (const artifact of state.groupArtifacts) {
		addEventGrants(
			candidates,
			{
				kind: "artifact",
				cardId: artifact.cardId,
				sourceHeroId: artifact.carriedBy ?? undefined,
			},
			event,
		);
	}
	const sourcePriority = { room: 10, artifact: 20, item: 30, hero: 40, enemy: 50, boss: 60 };
	return candidates.sort((a, b) => {
		const priorityA = a.grant.activation.priority ?? sourcePriority[a.source.kind];
		const priorityB = b.grant.activation.priority ?? sourcePriority[b.source.kind];
		return priorityA - priorityB ||
			`${a.source.cardId}:${a.grant.id}`.localeCompare(`${b.source.cardId}:${b.grant.id}`);
	});
}

/** Impede que um item de um herói reaja ao combate/dano de outro. */
export function eventGrantMatchesContext(
	candidate: EventAbilityGrantCandidate,
	event: EventName,
	ctx: SkillContext,
): boolean {
	const heroId = candidate.source.sourceHeroId;
	const enemyId = candidate.source.sourceEnemyId;
	if (enemyId) {
		if (
			event === "evt_hit" || event === "evt_destroy" ||
			event === "evt_would_be_destroyed" || event === "evt_damage_taken"
		) return !(event === "evt_damage_taken" && ctx.targetHeroIds?.length) &&
			(ctx.targetEnemyIds?.includes(enemyId) ?? false);
		if (
			event === "evt_attack_declared" || event === "evt_roll" ||
			event === "evt_damage_dealt" || event === "evt_kill" || event === "evt_targeted"
		) return enemyId === ctx.sourceEnemyId;
	}
	if (!heroId) return true;
	if (
		event === "evt_attack_declared" ||
		event === "evt_roll" ||
		event === "evt_hit" ||
		event === "evt_damage_dealt" ||
		event === "evt_destroy" ||
		event === "evt_kill"
	) {
		return heroId === ctx.sourceHeroId;
	}
	if (event === "evt_damage_taken" || event === "evt_would_be_destroyed")
		return candidate.grant.activation.targeting?.targetType === "tgt_self"
			? (ctx.targetHeroIds?.includes(heroId) ?? false)
			: Boolean(ctx.targetHeroIds?.length || ctx.targetEnemyIds?.length);
	return true;
}

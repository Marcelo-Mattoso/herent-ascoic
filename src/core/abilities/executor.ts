// Executor vNext: separa o efeito da ability do ciclo de vida da fonte.

import { lookupAbilityById } from "../data/abilities";
import type { AbilityGrant } from "../data/abilityTypes";
import { getCardById } from "../data/cards";
import { drainStack } from "../effects/resolver";
import { removeHeroItem } from "../rules/itemEffects";
import { destructionPreventionFlag } from "../rules/destruction";
import { awakeningRequirementMet } from "../rules/awakening";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import { evaluate } from "../skills/dsl/evaluate";
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
	return source.kind === "boss" ? "boss" : source.kind;
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
): string | null {
	if (!awakeningRequirementMet(state.despertar, grant.requiresAwakening))
		return "Esta concessão exige Despertar 4.";
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
	return null;
}

function consumeSource(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
): GameState {
	if (grant.activation.consumeSource === "none") return state;
	if (source.kind !== "item" || !source.sourceHeroId) return state;
	const withoutItem = removeHeroItem(state, source.sourceHeroId, source.cardId);
	if (withoutItem === state) return state;
	const pile = grant.activation.consumeSource === "remove" ? "removed" : "discarded";
	return {
		...withoutItem,
		decks: {
			...withoutItem.decks,
			itemDeck: {
				...withoutItem.decks.itemDeck,
				[pile]: [...withoutItem.decks.itemDeck[pile], source.cardId],
			},
		},
	};
}

function markGrantUsed(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
): GameState {
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
	const unavailable = canExecuteAbilityGrant(state, source, grant, triggeredBy);
	if (unavailable) return log(state, `[AVISO] ${unavailable}`);

	const targetIds = defaultTargetIds(source, grant, request.targetIds);
	const params = { ...ability.defaultParams, ...grant.params };
	const value = request.value ?? (params.value as number | string | null | undefined) ?? null;
	let next = consumeSource(state, source, grant);
	const hpCost = grant.activation.cost?.hp ?? 0;
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
	const ctx = buildScriptCtx(next, skillCtx, { ...params, value });
	if (ability.effect) next = evaluate(ability.effect, ctx);
	if (ability.script) {
		const script = getScript(`${ability.script}.run`);
		if (!script) return log(next, `[SCRIPT NÃO ENCONTRADO: ${ability.script}.run]`);
		next = script(ctx);
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
	const card = getCardById(source.cardId);
	for (const grant of card?.grants ?? []) {
		if (grant.activation.kind !== "event" || grant.activation.event !== event)
			continue;
		candidates.push({ source, grant });
	}
}

/** Retorna somente grants explícitos; SkillRefs legadas seguem no trigger engine. */
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
		for (const itemId of Object.values(hero.activeItems)) {
			if (!itemId) continue;
			addEventGrants(
				candidates,
				{ kind: "item", cardId: itemId, sourceHeroId: hero.id },
				event,
			);
		}
	}
	for (const enemy of state.activeEnemies.filter((entry) => entry.status === "active")) {
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
	return candidates;
}

/** Impede que um item de um herói reaja ao combate/dano de outro. */
export function eventGrantMatchesContext(
	candidate: EventAbilityGrantCandidate,
	event: EventName,
	ctx: SkillContext,
): boolean {
	const heroId = candidate.source.sourceHeroId;
	if (!heroId) return true;
	if (
		event === "evt_attack_declared" ||
		event === "evt_roll" ||
		event === "evt_damage_dealt" ||
		event === "evt_kill"
	) {
		return heroId === ctx.sourceHeroId;
	}
	if (event === "evt_damage_taken" || event === "evt_would_be_destroyed")
		return ctx.targetHeroIds?.includes(heroId) ?? false;
	return true;
}

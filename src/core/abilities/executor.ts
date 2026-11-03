import { HERO_ABILITY_IDS } from "../data/heroAbilityIds";
import { guardPassed, markSkillGuardUsed } from "../triggers/engine";
import { emit } from "../events/bus";
import type { AbilityGrant } from "../data/abilityTypes";
import { drainStack } from "../effects/resolver";
import { findHeroItemLocation, removeHeroItem } from "../rules/itemEffects";
import { destructionPreventionFlag } from "../rules/destruction";
import { buildScriptCtx } from "../scripts/context";
import { scriptOf } from "../gameEngine";
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
import { abilityById, abilityGrants, cardById, cardName, skillById, skillName } from "../gameEngine";
import { appendAlphaLog } from "../diagnostics/alphaLog";
import { checkCosts, payCosts } from "../../engine/cost";
import { awakeningCost, lifeCostOf } from "./costs";
import type { GameEngine } from "../gameEngine";

import { deckOf, decksOf, heroOf, withDecks } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
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
	readonly consumeFromPendingReward?: boolean;
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

function targeting(engine: GameEngine, grant: AbilityGrant): TargetingDefinition {
	const target = grant.activation.targeting;
	const ability = abilityById(engine, grant.abilityId);
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

export function canExecuteAbilityGrant(engine: GameEngine,
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
	triggeredBy: string,
	context?: SkillContext,
	targetIds?: readonly string[],
): string | null {
	const ability = abilityById(engine, grant.abilityId);
	if (!ability) return "Habilidade inexistente.";
	if (ability.script && !scriptOf(engine, `${ability.script}.run`)) return "Script da habilidade não encontrado.";
	if (!ability.effect && !ability.script) return "Habilidade sem efeito implementado.";
	const card = cardById(engine, source.cardId);
	if (!card) return "Carta de origem inexistente.";
	if (source.kind === "hero" &&
		!gameOf(state).heroes.some((hero) => hero.id === source.sourceHeroId &&
			hero.cardId === source.cardId && hero.status === "active"))
		return "Herói de origem não está em jogo.";
	if (source.kind === "item") {
		const owner = gameOf(state).heroes.find((hero) => hero.id === source.sourceHeroId && hero.status === "active");
		const equipped = owner && Object.values(owner.activeItems).includes(source.cardId);
		const mysticDrawReward = gameOf(state).status === "REWARD_PHASE" &&
			grant.activation.usableFromReward &&
			gameOf(state).pendingRewards.some((reward) => reward.type === "item" && reward.cardId === source.cardId);
		if (!equipped && !mysticDrawReward) return "Item não equipado por este herói.";
	}
	if (source.kind === "artifact" &&
		!gameOf(state).groupArtifacts.some((artifact) => artifact.cardId === source.cardId))
		return "Artefato não está em jogo.";
	const lifeCost = lifeCostOf(grant, source.sourceHeroId);
	const unpaid = checkCosts(
		[
			...(lifeCost ? [lifeCost] : []),
			awakeningCost(engine, grant, { kind: source.kind, id: source.cardId }),
		],
		state,
		source.sourceHeroId ?? "",
	);
	if (!unpaid.ok) return unpaid.reason;
	if (source.sourceHeroId && ActivationTracker.isDisabled(state, "hero", source.sourceHeroId))
		return "A fonte está incapacitada.";
	if (source.kind === "item" && source.sourceHeroId &&
		ActivationTracker.isDisabled(state, "item", `${source.sourceHeroId}:${source.cardId}`))
		return "Este item está exaurido.";
	if (grant.id.startsWith("legacy:")) {
		const definition = skillById(engine, grant.abilityId);
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
		const evalCtx = buildScriptCtx(engine, state, {
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
		if (targetIds.some((id) => !gameOf(state).heroes.some((hero) => hero.id === id && hero.status === "active") &&
			!gameOf(state).activeEnemies.some((enemy) => enemy.id === id && enemy.status === "active")))
			return "Alvo inválido para esta habilidade.";
		if (targetType === "tgt_enemy" && targetIds.some((id) =>
			!gameOf(state).activeEnemies.some((enemy) => enemy.id === id && enemy.status === "active")))
			return "Esta habilidade exige uma criatura como alvo.";
	}
	return null;
}

function consumeSource(
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
	consumeFromPendingReward = false,
): GameState {
	if (grant.activation.consumeSource === "none") return state;
	if (source.kind !== "item" || !source.sourceHeroId) return state;
	const owner = heroOf(state, source.sourceHeroId);
	const owned = !consumeFromPendingReward && owner
		? findHeroItemLocation(owner, source.cardId) !== null
		: false;
	const withoutItem = owned
		? removeHeroItem(state, source.sourceHeroId, source.cardId)
		: state;
	const pendingIndex = owned ? -1 : gameOf(state).pendingRewards.findIndex(
		(reward) => reward.type === "item" && reward.cardId === source.cardId,
	);
	const withoutPending = pendingIndex < 0
		? withoutItem
		: withGame(withoutItem, (prevGame) => ({ ...prevGame, pendingRewards: gameOf(state).pendingRewards.filter((_, index) => index !== pendingIndex) }));
	const pile = grant.activation.consumeSource === "remove" ? "removed" : "discarded";
	return withDecks(withoutPending, {
			...decksOf(withoutPending),
			itemDeck: {
				...deckOf(withoutPending, "itemDeck"),
				[pile]: [...deckOf(withoutPending, "itemDeck")[pile], source.cardId],
			},
		});
}

function markGrantUsed(engine: GameEngine,
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
): GameState {
	if (grant.id.startsWith("legacy:")) {
		const definition = skillById(engine, grant.abilityId);
		return definition ? markSkillGuardUsed(state, definition, source.sourceHeroId) : state;
	}
	const limit = grant.activation.limit;
	if (!limit || limit.maxUses !== 1) return state;
	return ActivationTracker.disable(engine, state, {
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
export function executeAbilityGrant(engine: GameEngine,
	state: GameState,
	request: AbilityGrantExecution,
): GameState {
	const { source, grant, triggeredBy } = request;
	const ability = abilityById(engine, grant.abilityId);
	if (!ability) return log(state, `[AVISO] Ability não encontrada: ${grant.abilityId}`);
	const requestedTargetIds = defaultTargetIds(source, grant, request.targetIds);
	const context: SkillContext = request.context ?? {
		triggeredBy,
		sourceHeroId: source.sourceHeroId,
		sourceEnemyId: source.sourceEnemyId,
		targetHeroIds: requestedTargetIds.filter((id) => gameOf(state).heroes.some((hero) => hero.id === id)),
		targetEnemyIds: requestedTargetIds.filter((id) => gameOf(state).activeEnemies.some((enemy) => enemy.id === id)),
		value: request.value,
	};
	const unavailable = canExecuteAbilityGrant(engine, state, source, grant, triggeredBy, context, requestedTargetIds);
	if (unavailable) return log(state, `[AVISO] ${unavailable}`);
	const script = ability.script ? scriptOf(engine, `${ability.script}.run`) : null;
	if (ability.script && !script)
		return log(state, `[SCRIPT NÃO ENCONTRADO: ${ability.script}.run]`);
	if (!ability.effect && !script)
		return log(state, `[AVISO] Ability sem implementação: ${ability.id}`);

	const targetIds = requestedTargetIds;
	const params = { ...ability.defaultParams, ...grant.params };
	const value = request.value ?? (params.value as number | string | null | undefined) ?? null;
	const parameterValue = triggeredBy === "manual" && request.value != null
		? request.value
		: (params.value as number | string | null | undefined) ?? request.value ?? null;
	let next = state;
	if (triggeredBy === "manual" && source.sourceHeroId)
		({ state: next } = emit(engine, next, { type: "SkillUsed", payload: {
			sourceId: source.sourceHeroId, skillId: ability.id,
		} }));
	next = consumeSource(next, source, grant, request.consumeFromPendingReward);
	const lifeCost = lifeCostOf(grant, source.sourceHeroId);
	if (lifeCost && source.sourceHeroId) {
		const unpaid = checkCosts([lifeCost], next, source.sourceHeroId);
		if (!unpaid.ok) return log(state, `[AVISO] ${unpaid.reason}`);
		next = payCosts([lifeCost], next, source.sourceHeroId);
	}

	const skillCtx = {
		...context,
		triggeredBy,
		sourceHeroId: source.sourceHeroId,
		sourceEnemyId: source.sourceEnemyId,
		targetHeroIds: targetIds.filter((id) => gameOf(next).heroes.some((hero) => hero.id === id)),
		targetEnemyIds: targetIds.filter((id) =>
			gameOf(next).activeEnemies.some((enemy) => enemy.id === id),
		),
		skillId: ability.id,
		value,
	};
	const ctx = buildScriptCtx(engine, next, skillCtx, { ...params, value: parameterValue });
	if (ability.effect) next = evaluate(ability.effect, ctx);
	if (ability.script) {
		next = script!(ctx);
	}
	next = drainStack(engine, next);
	// Antes da destruição, i_prevent_destroy não pode curar uma entidade que
	// ainda não recebeu o dano. Em vez disso, a aplicação pendente consome esta
	// marca e preserva 1 ponto de vida.
	if (
		triggeredBy === "evt_would_be_destroyed" &&
		effectPreventsDestruction(ability.effect)
	) {
		const targetId = targetIds[0];
		if (targetId) {
			next = withGame(next, (prevGame) => ({ ...prevGame, flags: {
					...gameOf(next).flags,
					[destructionPreventionFlag(targetId)]: true,
				} }));
		}
	}
	next = markGrantUsed(engine, next, source, grant);
	if (grant.activation.actionCost === "consume_hero_action" && source.sourceHeroId) {
		next = ActivationTracker.endHeroTurn(next, source.sourceHeroId);
	}
	return appendAlphaLog(next,
		`Habilidade ${skillName(engine, ability.id)} ativada por ${cardName(engine, source.cardId)} (${source.sourceHeroId ?? source.sourceEnemyId ?? "grupo"}); evento ${triggeredBy}; alvos [${targetIds.join(", ") || "nenhum"}]; parâmetros ${JSON.stringify(params)}.`);
}

export function resolveManualGrantTarget(engine: GameEngine,
	state: GameState,
	source: AbilityGrantSource,
	grant: AbilityGrant,
	targetIds?: readonly string[],
) {
	const sourceId = source.sourceHeroId ?? source.sourceEnemyId;
	if (!sourceId)
		return { kind: "unavailable" as const, reason: "Fonte sem entidade." };
	return resolveManualSkillTarget(engine, state, targeting(engine, grant), sourceId, targetIds);
}

function addEventGrants(engine: GameEngine,
	candidates: EventAbilityGrantCandidate[],
	source: AbilityGrantSource,
	event: EventName,
): void {
	for (const grant of abilityGrants(engine, source.cardId)) {
		if (grant.activation.kind !== "event" || grant.activation.event !== event)
			continue;
		candidates.push({ source, grant });
	}
}

/** Descoberta única de grants explícitos e SkillRefs normalizadas. */
export function collectEventAbilityGrantCandidates(engine: GameEngine,
	state: GameState,
	event: EventName,
): readonly EventAbilityGrantCandidate[] {
	const candidates: EventAbilityGrantCandidate[] = [];
	for (const hero of gameOf(state).heroes.filter((entry) => entry.status === "active")) {
		addEventGrants(engine,
			candidates,
			{ kind: "hero", cardId: hero.cardId, sourceHeroId: hero.id },
			event,
		);
		for (const itemId of new Set(Object.values(hero.activeItems))) {
			if (!itemId) continue;
			addEventGrants(engine,
				candidates,
				{ kind: "item", cardId: itemId, sourceHeroId: hero.id },
				event,
			);
		}
	}
	for (const enemy of gameOf(state).activeEnemies.filter((entry) =>
		entry.status === "active" ||
		((event === "evt_destroy" || event === "evt_kill") && entry.status === "defeated"),
	)) {
		addEventGrants(engine,
			candidates,
			{
				kind: enemy.id === "boss" ? "boss" : "enemy",
				cardId: enemy.cardId,
				sourceEnemyId: enemy.id,
			},
			event,
		);
	}
	if (gameOf(state).currentRoom) {
		addEventGrants(engine, candidates, { kind: "room", cardId: gameOf(state).currentRoom!.cardId }, event);
	}
	for (const artifact of gameOf(state).groupArtifacts) {
		addEventGrants(engine,
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
		if (event === "evt_roll" && candidate.grant.abilityId === HERO_ABILITY_IDS.power_supreme_rift_rune) {
			return Boolean(ctx.targetHeroIds?.length);
		}
		return heroId === ctx.sourceHeroId;
	}
	if (event === "evt_damage_taken" || event === "evt_would_be_destroyed")
		return candidate.grant.activation.targeting?.targetType === "tgt_self"
			? (ctx.targetHeroIds?.includes(heroId) ?? false)
			: Boolean(ctx.targetHeroIds?.length || ctx.targetEnemyIds?.length);
	return true;
}

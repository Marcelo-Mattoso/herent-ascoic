import type { SkillRef } from "../data/cardTypes";



import { resolveManualGrantTarget } from "../abilities/executor";
import type { SkillDefinition } from "../data/skillTypes";
import type { DamageType } from "../events/types";

import { resolveManualSkillTarget } from "../skills/targeting";
import { guardPassed } from "../triggers/engine";
import { isVoluntaryTrigger } from "../skills/activationMode";
import type { ConditionNode, EffectNode, ExprNode } from "../skills/dsl/types";
import { ActivationTracker } from "../state/activation";
import type { BonusEntry } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroRecord, HeroState, ItemSlotType } from "../state/heroState";
import { abilityById, cardById, cardName, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { modifierStatSpec } from "../skills/dsl/kinds/shared";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import { buildScriptCtx } from "../scripts/context";

import { awakeningOf, enemiesOf, heroesOf, pausedOf, pendingSkillChoiceOf, pendingSkillTargetOf, pendingTriggerInterruptOf } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
export type ItemLocation =
	| { kind: "active"; slot: ItemSlotType }
	| { kind: "backpack"; index: number };

export interface ItemModifierBreakdown {
	readonly source: string;
	readonly value: number;
}

interface ItemSkillSource {
	readonly cardId: string;
	readonly ownerHeroId: string | null;
	readonly sourceKind: "item" | "artifact";
	readonly sourceId: string;
	readonly def: SkillDefinition;
	readonly ref: SkillRef;
	readonly params: Readonly<Record<string, unknown>>;
}

export function itemActivationId(heroId: string, itemId: string): string {
	return `${heroId}:${itemId}`;
}

export function itemIsExhausted(
	state: GameState,
	heroId: string,
	itemId: string,
): boolean {
	const prefix = `item:${itemActivationId(heroId, itemId)}`;
	return Object.keys({ ...gameOf(state).disabled, ...gameOf(state).combat!?.disabled }).some(
		(key) => key === prefix || key.startsWith(`${prefix}:`),
	);
}

export function manualItemUnavailableReason(engine: GameEngine, 
	state: GameState,
	heroId: string,
	itemId: string,
): string | null {
	const hero = heroesOf(state).find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) return "Herói inválido ou inativo.";
	const location = findHeroItemLocation(hero, itemId);
	const card = cardById(engine, itemId);
	const mysticDrawReward = gameOf(state).status === "REWARD_PHASE" &&
		card?.grants?.some((grant) => grant.activation.kind === "manual" &&
			grant.activation.usableFromReward) &&
		gameOf(state).pendingRewards.some((reward) => reward.type === "item" && reward.cardId === itemId);
	if (!location && !mysticDrawReward) return "Este item não pertence ao herói.";
	if (location?.kind === "backpack") {
		return "Equipe este item para ativá-lo.";
	}
	if (
		pausedOf(state) ||
		pendingSkillChoiceOf(state) ||
		pendingSkillTargetOf(state) ||
		pendingTriggerInterruptOf(state)
	)
		return "Conclua a escolha pendente primeiro.";
	if (gameOf(state).status === "HERO_ACTION" || gameOf(state).status === "BOSS_COMBAT") {
		if (
			!(["selecting_hero", "selecting_target"].includes(gameOf(state).combat?.phase ?? "")) ||
			(gameOf(state).combat?.phase === "selecting_target" && gameOf(state).combat!.selectedHeroId !== heroId) ||
			ActivationTracker.isHeroDisabledThisRound(state, heroId)
		)
			return "Selecione um herói que ainda pode agir nesta rodada.";
	} else if (
		![
			"REVEAL_ROOM",
			"ROOM_EFFECT",
			"COMBAT_START",
			"REWARD_PHASE",
			"XP_SPEND_PHASE",
			"OPEN_PATHS",
			"DUNGEON_EXHAUSTED",
		].includes(gameOf(state).status)
	) {
		return "Aguarde uma janela de ação para usar o item.";
	}
	const manualGrant = card?.grants?.find(
		(grant) => grant.activation.kind === "manual",
	);
	const preparableGrant = card?.grants?.find(
		(grant) => grant.activation.kind === "event" && grant.activation.decision === "optional",
	);
	if (card?.grants?.length) {
		const grant = manualGrant ?? preparableGrant;
		if (!grant) return "Este item reage automaticamente a uma janela do jogo.";
		const grantLockId = `${heroId}:${itemId}:${grant.id}`;
		if (
			grant.activation.limit?.maxUses === 1 &&
			ActivationTracker.isDisabled(state, "item", grantLockId)
		) {
			return "Este item já foi usado neste escopo.";
		}
		if (hero.currentLife <= (grant.activation.cost?.hp ?? 0))
			return "Vida insuficiente para pagar o custo.";
		if (manualGrant) {
			const target = resolveManualGrantTarget(engine, state,
				{ kind: "item", cardId: itemId, sourceHeroId: heroId }, grant);
			if (target.kind === "unavailable") return target.reason;
		}
		return null;
	}
	const def = skillsOf(engine, itemId)[0]?.def;
	const preparableLegacy = def?.operate_type === "op_triggered" &&
		isVoluntaryTrigger(def, "item", def.trigger!.event);
	if (def?.operate_type === "op_triggered" && !preparableLegacy)
		return "Este item reage automaticamente ao evento da carta.";
	if (!def || (!itemCanBeUsedManually(def) && !preparableLegacy))
		return "Este item não tem ativação manual.";
	if (
		ActivationTracker.isDisabled(
			state,
			"item",
			itemActivationId(heroId, itemId),
		)
	)
		return "Este item já foi usado neste escopo.";
	if (!guardPassed(state, def, heroId))
		return "O limite de uso deste efeito já foi atingido.";
	if (hero.currentLife <= (def.cost?.hp ?? 0))
		return "Vida insuficiente para pagar o custo.";
	const target = preparableLegacy ? null : resolveManualSkillTarget(engine, state, def, heroId);
	return target?.kind === "unavailable" ? target.reason : null;
}

export function manualItemOptions(engine: GameEngine, state: GameState, heroId: string) {
	const hero = heroesOf(state).find((h) => h.id === heroId);
	// A lista de ações só inclui itens do herói que passaram pela validação de equipamento.
	const itemIds = [
		...Object.values(hero?.activeItems ?? {}),
		...(hero?.backpack ?? []),
	];
	return itemIds.flatMap((itemId) => {
		if (!itemId || manualItemUnavailableReason(engine, state, heroId, itemId))
			return [];
		const card = cardById(engine, itemId);
		const grant = card?.grants?.find((entry) => entry.activation.kind === "manual" ||
			(entry.activation.kind === "event" && entry.activation.decision === "optional"));
		const def = skillsOf(engine, itemId)[0]?.def;
		const target = grant
			? grant.activation.kind === "event"
				? { kind: "ready" as const, targetIds: [] as readonly string[] }
				: resolveManualGrantTarget(engine, state,
					{ kind: "item", cardId: itemId, sourceHeroId: heroId }, grant)
			: def?.operate_type === "op_triggered"
				? { kind: "ready" as const, targetIds: [] as readonly string[] }
				: resolveManualSkillTarget(engine, state, def!, heroId);
		return [
			{
				itemId,
				name: cardName(engine, itemId),
				target,
				prepared: Boolean(gameOf(state).preparedAbilities?.[`item:${heroId}:${itemId}:${grant?.id ?? def?.id}`]),
				activation: grant?.activation.kind === "event" || def?.operate_type === "op_triggered" ? "prepare" as const : "manual" as const,
			},
		];
	});
}

export function findHeroItemLocation(
	hero: HeroRecord,
	itemId: string,
): ItemLocation | null {
	for (const [slot, activeItemId] of Object.entries(hero.activeItems)) {
		if (activeItemId === itemId) {
			return { kind: "active", slot: slot as ItemSlotType };
		}
	}

	const index = hero.backpack.findIndex((id) => id === itemId);
	return index >= 0 ? { kind: "backpack", index } : null;
}

export function removeHeroItem(
	state: GameState,
	heroId: string,
	itemId: string,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, heroes: gameOf(state).heroes.map((hero) => {
			if (hero.id !== heroId) return hero;
			const location = findHeroItemLocation(hero, itemId);
			if (!location) return hero;
			const activeItems = { ...hero.activeItems };
			if (location.kind === "active") {
				for (const slot of Object.keys(activeItems) as ItemSlotType[]) {
					if (activeItems[slot] === itemId) delete activeItems[slot];
				}
			}
			return {
				...hero,
				activeItems,
				backpack:
					location.kind === "backpack"
						? hero.backpack.filter((_, index) => index !== location.index)
						: hero.backpack,
			};
		}) }));
}

export function isConsumableItem(engine: GameEngine, itemId: string): boolean {
	const card = cardById(engine, itemId);
	return card?.type === "item" && card.itemClass === "consumable";
}

export function itemCanBeUsedManually(def: SkillDefinition): boolean {
	if (
		def.operate_type === "op_active" ||
		def.operate_type === "op_active_buff"
	) {
		return true;
	}
	return Boolean(def.effect?.some(isManualItemEffect));
}

export function itemShouldBeConsumed(engine: GameEngine, itemId: string): boolean {
	return isConsumableItem(engine, itemId);
}

export function itemUseTargetIds(
	state: GameState,
	def: SkillDefinition,
	heroId: string,
	targetHeroId?: string,
	targetEnemyId?: string,
): string[] {
	if (def.target_type === "tgt_enemy") {
		const pairedEnemyId = gameOf(state).combat?.pairs.find(
			(p) => p.heroId === heroId,
		)?.enemyId;
		const fallbackEnemyId = enemiesOf(state).find(
			(e) => e.status === "active",
		)?.id;
		const enemyId = targetEnemyId ?? pairedEnemyId ?? fallbackEnemyId;
		return enemyId ? [enemyId] : [];
	}
	if (def.target_type === "tgt_item" || def.affect_scope === "scp_none") {
		return [];
	}
	return [targetHeroId ?? heroId];
}

export function collectHeroHitBonusesFromItems(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
	enemy?: EnemyState,
): BonusEntry[] {
	const continuousGrants = Object.values(hero.activeItems).flatMap((itemId) => {
		if (!itemId) return [];
		const item = cardById(engine, itemId);
		if (item?.type !== "item") return [];
		return (item.grants ?? []).flatMap((grant) => {
			if (grant.activation.kind !== "continuous") return [];
			if (!conditionsApply(engine, grant.activation.conditions, state, hero, enemy))
				return [];
			const ability = abilityById(engine, grant.abilityId);
			const params = { ...ability?.defaultParams, ...grant.params };
			return (ability?.effect ?? []).flatMap((effect) => {
				if (effect.kind !== "p_modifier" || effect.stat !== "s_hit_bonus")
					return [];
				const value = resolveNumber(effect.value, params, awakeningOf(state));
				return value ? [{ source: cardName(engine, itemId), value }] : [];
			});
		});
	});
	return [
		...continuousGrants,
		...itemSkillSourcesForHero(engine, hero, state).flatMap((source) => {
			if (!skillAffectsAttackRoll(source.def)) return [];
			if (!conditionsApply(engine, source.def.conditions, state, hero, enemy))
				return [];
			const hitParam = source.def.rules?.hitBonusParam;
			if (hitParam) {
				return bonusEntry(engine, source, numericParam(source.params, hitParam));
			}
			return modifierEntries(engine, source, state, "hit");
		}),
	];
}

export function collectHeroDamageBonusesFromItems(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
	enemy: EnemyState | undefined,
	rollMargin: number,
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(engine, hero, state).flatMap((source) => {
		if (!skillAffectsDamageDealt(source.def)) return [];
		if (!conditionsApply(engine, source.def.conditions, state, hero, enemy)) return [];
		const minMargin = source.def.rules?.minRollMargin;
		if (minMargin !== undefined && rollMargin < minMargin) return [];
		return modifierEntries(engine, source, state, "damage");
	});
}

export function collectHeroDamageReductionsFromItems(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
	damageType: DamageType = "physical",
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(engine, hero, state).flatMap((source) =>
		modifierEntries(engine, source, state, "reduction", damageType),
	);
}

export function totalItemValue(
	breakdown: readonly ItemModifierBreakdown[],
): number {
	return breakdown.reduce((sum, entry) => sum + entry.value, 0);
}

export function collectHeroLifeDrainFromItems(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(engine, hero, state)
		.flatMap((source) => {
			const value = source.def.rules?.lifeDrain;
			return value ? [{ source: sourceLabel(engine, source), value }] : [];
		});
}

export function formatItemBreakdown(
	breakdown: readonly ItemModifierBreakdown[],
	prefix: string,
): string[] {
	return breakdown
		.filter((entry) => entry.value !== 0)
		.map((entry) => `${entry.source} ${prefix}${entry.value}`);
}

function isManualItemEffect(effect: EffectNode): boolean {
	if (
		effect.kind === "i_prevent_dungeon_discard" ||
		effect.kind === "i_recover_dungeon" ||
		effect.kind === "i_draw" ||
		effect.kind === "i_reveal_dungeon"
	) {
		return true;
	}
	if (effect.kind === "i_if") {
		return (
			effect.then.some(isManualItemEffect) ||
			Boolean(effect.else?.some(isManualItemEffect))
		);
	}
	return false;
}

function itemSkillSourcesForHero(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
): ItemSkillSource[] {
	const sources: ItemSkillSource[] = [];

	for (const itemId of Object.values(hero.activeItems)) {
		if (!itemId) continue;
		const item = cardById(engine, itemId);
		if (item?.type === "item" && item.useTiming) continue;
		// Grants explícitos já descrevem todo o comportamento da carta. Os
		// SkillRefs ficam apenas para compatibilidade e não devem duplicá-lo.
		if (item?.type === "item" && item.grants?.length) continue;
		sources.push(...skillSourcesForCard(engine, itemId, "item", itemId, hero.id));
	}

	for (const artifact of gameOf(state).groupArtifacts) {
		if (artifact.carriedBy && artifact.carriedBy !== hero.id) continue;
		if (ActivationTracker.isDisabled(state, "artifact", artifact.cardId))
			continue;
		sources.push(
			...skillSourcesForCard(engine, 
				artifact.cardId,
				"artifact",
				artifact.cardId,
				artifact.carriedBy,
			),
		);
	}

	return sources;
}

function skillSourcesForCard(engine: GameEngine, 
	cardId: string,
	sourceKind: "item" | "artifact",
	sourceId: string,
	ownerHeroId: string | null,
): ItemSkillSource[] {
	return skillsOf(engine, cardId).map(({ def, ref }) => ({
		cardId,
		ownerHeroId,
		sourceKind,
		sourceId,
		def,
		ref,
		params: { ...(def.params ?? {}), ...(ref.params ?? {}) },
	}));
}

function skillAffectsAttackRoll(def: SkillDefinition): boolean {
	if (def.rules?.hitBonusParam) return true;
	return Boolean(
		def.effect?.some(
			(effect) =>
				effect.kind === "p_modifier" &&
				(effect.stat === "s_hit_bonus" || effect.stat === "s_hit_penalty"),
		),
	);
}

function skillAffectsDamageDealt(def: SkillDefinition): boolean {
	return Boolean(
		def.effect?.some(
			(effect) =>
				effect.kind === "p_modifier" &&
				(effect.stat === "s_damage_dealt" ||
					effect.stat === "s_damage_penalty"),
		),
	);
}

function modifierEntries(engine: GameEngine, 
	source: ItemSkillSource,
	state: GameState,
	kind: "hit" | "damage" | "reduction",
	damageType: DamageType = "physical",
): ItemModifierBreakdown[] {
	if (!source.def.effect) return [];
	const entries: ItemModifierBreakdown[] = [];
	for (const effect of source.def.effect) {
		if (effect.kind !== "p_modifier") continue;
		const value = resolveNumber(effect.value, source.params, awakeningOf(state));
		if (!value) continue;

		if (kind === "hit" && effect.stat === "s_hit_bonus") {
			entries.push({ source: sourceLabel(engine, source), value });
		}
		if (kind === "hit" && effect.stat === "s_hit_penalty") {
			entries.push({ source: sourceLabel(engine, source), value: -value });
		}
		if (kind === "damage" && effect.stat === "s_damage_dealt") {
			entries.push({ source: sourceLabel(engine, source), value });
		}
		if (kind === "damage" && effect.stat === "s_damage_penalty") {
			entries.push({ source: sourceLabel(engine, source), value: -value });
		}
		if (kind === "reduction" && effect.stat === "s_damage_reduction") {
			entries.push({ source: sourceLabel(engine, source), value });
		}
		if (
			kind === "reduction" &&
			modifierStatSpec(engine, effect.stat)?.damageType === damageType
		) {
			entries.push({ source: sourceLabel(engine, source), value });
		}
	}
	return entries;
}

function bonusEntry(engine: GameEngine, source: ItemSkillSource, value: number): BonusEntry[] {
	return value ? [{ source: sourceLabel(engine, source), value }] : [];
}

function sourceLabel(engine: GameEngine, source: ItemSkillSource): string {
	return cardName(engine, source.cardId);
}

function numericParam(
	params: Readonly<Record<string, unknown>>,
	name: string,
): number {
	const value = params[name];
	if (typeof value === "number") return value;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function resolveNumber(
	node: ExprNode,
	params: Readonly<Record<string, unknown>>,
	despertar: number,
): number {
	if (typeof node === "number") return node;
	if (typeof node === "string") {
		if (node.startsWith("$")) return numericParam(params, node.slice(1));
		const parsed = Number(node);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (!("op" in node)) {
		const value = node[despertar];
		return typeof value === "number" ? value : 0;
	}
	const [left, right] = node.args;
	const a = resolveNumber(left, params, despertar);
	const b = resolveNumber(right, params, despertar);
	switch (node.op) {
		case "add":
			return a + b;
		case "sub":
			return a - b;
		case "mul":
			return a * b;
		case "div":
			return b === 0 ? 0 : a / b;
		case "min":
			return Math.min(a, b);
		case "max":
			return Math.max(a, b);
	}
	return 0;
}

export function conditionsApply(engine: GameEngine, 
	conditions: readonly ConditionNode[] | undefined,
	state: GameState,
	hero: HeroState,
	enemy?: EnemyState,
): boolean {
	if (!conditions || conditions.length === 0) return true;
	const ctx = buildScriptCtx(engine, state, {
		triggeredBy: "on_use",
		sourceHeroId: hero.id,
		...(enemy ? { targetEnemyIds: [enemy.id] } : {}),
	});
	return conditions.every((condition) => resolveCondition(condition, ctx));
}

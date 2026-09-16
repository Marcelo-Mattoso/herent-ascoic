import type { SkillRef } from "../data/cardTypes";
import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import { lookupAbilityById } from "../data/abilities";
import type { SkillDefinition } from "../data/skillTypes";
import type { DamageType } from "../events/types";
import { cardSkills } from "../skills/lookup";
import { resolveManualSkillTarget } from "../skills/targeting";
import { guardPassed } from "../triggers/engine";
import type { ConditionNode, EffectNode, ExprNode } from "../skills/dsl/types";
import { ActivationTracker } from "../state/activation";
import type { BonusEntry } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState, ItemSlotType } from "../state/heroState";

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

export function manualItemUnavailableReason(
	state: GameState,
	heroId: string,
	itemId: string,
): string | null {
	const hero = state.heroes.find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) return "Herói inválido ou inativo.";
	const location = findHeroItemLocation(hero, itemId);
	if (!location) return "Este item não pertence ao herói.";
	if (
		state.paused ||
		state.pendingSkillChoice ||
		state.pendingSkillTarget ||
		state.pendingTriggerInterrupt
	)
		return "Conclua a escolha pendente primeiro.";
	if (state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") {
		if (
			state.combat?.phase !== "selecting_target" ||
			state.combat.selectedHeroId !== heroId ||
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
		].includes(state.status)
	) {
		return "Aguarde uma janela de ação para usar o item.";
	}
	const card = getCardById(itemId);
	const manualGrant = card?.grants?.find(
		(grant) => grant.activation.kind === "manual",
	);
	if (card?.grants?.length) {
		if (!manualGrant) return "Este item reage a uma janela do jogo.";
		const grantLockId = `${heroId}:${itemId}:${manualGrant.id}`;
		if (manualGrant.activation.limit?.maxUses === 1 &&
			ActivationTracker.isDisabled(state, "item", grantLockId)) {
			return "Este item já foi usado neste escopo.";
		}
		if (hero.currentLife <= (manualGrant.activation.cost?.hp ?? 0))
			return "Vida insuficiente para pagar o custo.";
		return null;
	}
	const def = cardSkills(itemId)[0]?.def;
	if (!def || !itemCanBeUsedManually(def))
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
	const target = resolveManualSkillTarget(state, def, heroId);
	return target.kind === "unavailable" ? target.reason : null;
}

export function manualItemOptions(state: GameState, heroId: string) {
	const hero = state.heroes.find((h) => h.id === heroId);
	// Itens de ativação manual podem estar equipados ou na mochila.
	const itemIds = [
		...Object.values(hero?.activeItems ?? {}),
		...(hero?.backpack ?? []),
	];
	return itemIds.flatMap((itemId) => {
		if (!itemId || manualItemUnavailableReason(state, heroId, itemId))
			return [];
		const def = cardSkills(itemId)[0]!.def;
		return [
			{
				itemId,
				name: getCardName(itemId),
				target: resolveManualSkillTarget(state, def, heroId),
			},
		];
	});
}

export function findHeroItemLocation(
	hero: HeroState,
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
	return {
		...state,
		heroes: state.heroes.map((hero) => {
			if (hero.id !== heroId) return hero;
			const location = findHeroItemLocation(hero, itemId);
			if (!location) return hero;
			const activeItems = { ...hero.activeItems };
			if (location.kind === "active") delete activeItems[location.slot];
			return {
				...hero,
				activeItems,
				backpack:
					location.kind === "backpack"
						? hero.backpack.filter((_, index) => index !== location.index)
						: hero.backpack,
			};
		}),
	};
}

export function isConsumableItem(itemId: string): boolean {
	const card = getCardById(itemId);
	return card?.type === "item" && card.itemClass === "consumable";
}

export function isSingleUseSpecialItem(skillId: string): boolean {
	return skillId === "item_skill_mystic_draw";
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

export function itemShouldBeConsumed(itemId: string, skillId: string): boolean {
	return isConsumableItem(itemId) || isSingleUseSpecialItem(skillId);
}

export function itemUseTargetIds(
	state: GameState,
	def: SkillDefinition,
	heroId: string,
	targetHeroId?: string,
	targetEnemyId?: string,
): string[] {
	if (def.target_type === "tgt_enemy") {
		const pairedEnemyId = state.combat?.pairs.find(
			(p) => p.heroId === heroId,
		)?.enemyId;
		const fallbackEnemyId = state.activeEnemies.find(
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

export function collectHeroHitBonusesFromItems(
	hero: HeroState,
	state: GameState,
	enemy?: EnemyState,
): BonusEntry[] {
	const continuousGrants = Object.values(hero.activeItems).flatMap((itemId) => {
		if (!itemId) return [];
		const item = getCardById(itemId);
		if (item?.type !== "item") return [];
		return (item.grants ?? []).flatMap((grant) => {
			if (grant.activation.kind !== "continuous") return [];
			if (!conditionsApply(grant.activation.conditions, state, hero, enemy))
				return [];
			const ability = lookupAbilityById(grant.abilityId);
			const params = { ...ability?.defaultParams, ...grant.params };
			return (ability?.effect ?? []).flatMap((effect) => {
				if (effect.kind !== "p_modifier" || effect.stat !== "s_hit_bonus")
					return [];
				const value = resolveNumber(effect.value, params, state.despertar);
				return value ? [{ source: getCardName(itemId), value }] : [];
			});
		});
	});
	return [
		...continuousGrants,
		...itemSkillSourcesForHero(hero, state).flatMap((source) => {
		if (!skillAffectsAttackRoll(source.def)) return [];
		if (!conditionsApply(source.def.conditions, state, hero, enemy)) return [];
		if (source.def.id === "skill_hunter_focus") {
			return bonusEntry(source, numericParam(source.params, "value"));
		}
		return modifierEntries(source, state, "hit");
		}),
	];
}

export function collectHeroDamageBonusesFromItems(
	hero: HeroState,
	state: GameState,
	enemy: EnemyState | undefined,
	rollMargin: number,
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(hero, state).flatMap((source) => {
		if (!skillAffectsDamageDealt(source.def)) return [];
		if (!conditionsApply(source.def.conditions, state, hero, enemy)) return [];
		if (isMarginDamageSkill(source.def.id) && rollMargin < 4) return [];
		return modifierEntries(source, state, "damage");
	});
}

export function collectHeroDamageReductionsFromItems(
	hero: HeroState,
	state: GameState,
	damageType: DamageType = "physical",
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(hero, state).flatMap((source) =>
		modifierEntries(source, state, "reduction", damageType),
	);
}

export function totalItemValue(
	breakdown: readonly ItemModifierBreakdown[],
): number {
	return breakdown.reduce((sum, entry) => sum + entry.value, 0);
}

export function collectHeroLifeDrainFromItems(
	hero: HeroState,
	state: GameState,
): ItemModifierBreakdown[] {
	return itemSkillSourcesForHero(hero, state)
		.filter(
			(source) => source.def.id === "item_skill_drain_life_and_deadly_edge",
		)
		.map((source) => ({ source: sourceLabel(source), value: 1 }));
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

function itemSkillSourcesForHero(
	hero: HeroState,
	state: GameState,
): ItemSkillSource[] {
	const sources: ItemSkillSource[] = [];

	for (const itemId of Object.values(hero.activeItems)) {
		if (!itemId) continue;
		const item = getCardById(itemId);
		if (item?.type === "item" && item.useTiming) continue;
		// Grants explícitos já descrevem todo o comportamento da carta. Os
		// SkillRefs ficam apenas para compatibilidade e não devem duplicá-lo.
		if (item?.type === "item" && item.grants?.length) continue;
		sources.push(...skillSourcesForCard(itemId, "item", itemId, hero.id));
	}

	for (const artifact of state.groupArtifacts) {
		if (artifact.carriedBy && artifact.carriedBy !== hero.id) continue;
		if (ActivationTracker.isDisabled(state, "artifact", artifact.cardId))
			continue;
		sources.push(
			...skillSourcesForCard(
				artifact.cardId,
				"artifact",
				artifact.cardId,
				artifact.carriedBy,
			),
		);
	}

	return sources;
}

function skillSourcesForCard(
	cardId: string,
	sourceKind: "item" | "artifact",
	sourceId: string,
	ownerHeroId: string | null,
): ItemSkillSource[] {
	return cardSkills(cardId).map(({ def, ref }) => ({
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
	if (def.id === "skill_hunter_focus") return true;
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

function isMarginDamageSkill(skillId: string): boolean {
	return (
		skillId === "item_skill_deadly_edge" ||
		skillId === "item_skill_drain_life_and_deadly_edge"
	);
}

function modifierEntries(
	source: ItemSkillSource,
	state: GameState,
	kind: "hit" | "damage" | "reduction",
	damageType: DamageType = "physical",
): ItemModifierBreakdown[] {
	if (!source.def.effect) return [];
	const entries: ItemModifierBreakdown[] = [];
	for (const effect of source.def.effect) {
		if (effect.kind !== "p_modifier") continue;
		const value = resolveNumber(effect.value, source.params, state.despertar);
		if (!value) continue;

		if (kind === "hit" && effect.stat === "s_hit_bonus") {
			entries.push({ source: sourceLabel(source), value });
		}
		if (kind === "hit" && effect.stat === "s_hit_penalty") {
			entries.push({ source: sourceLabel(source), value: -value });
		}
		if (kind === "damage" && effect.stat === "s_damage_dealt") {
			entries.push({ source: sourceLabel(source), value });
		}
		if (kind === "damage" && effect.stat === "s_damage_penalty") {
			entries.push({ source: sourceLabel(source), value: -value });
		}
		if (kind === "reduction" && effect.stat === "s_damage_reduction") {
			entries.push({ source: sourceLabel(source), value });
		}
		if (
			kind === "reduction" &&
			damageType === "purple" &&
			effect.stat === "s_purple_damage_reduction"
		) {
			entries.push({ source: sourceLabel(source), value });
		}
	}
	return entries;
}

function bonusEntry(source: ItemSkillSource, value: number): BonusEntry[] {
	return value ? [{ source: sourceLabel(source), value }] : [];
}

function sourceLabel(source: ItemSkillSource): string {
	return getCardName(source.cardId);
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

function conditionsApply(
	conditions: readonly ConditionNode[] | undefined,
	state: GameState,
	hero: HeroState,
	enemy?: EnemyState,
): boolean {
	if (!conditions || conditions.length === 0) return true;
	return conditions.every((condition) =>
		conditionApplies(condition, state, hero, enemy),
	);
}

function conditionApplies(
	condition: ConditionNode,
	state: GameState,
	hero: HeroState,
	enemy?: EnemyState,
): boolean {
	if ("any_of" in condition) {
		return condition.any_of.some((child) =>
			conditionApplies(child, state, hero, enemy),
		);
	}
	switch (condition.kind) {
		case "and":
			return condition.children.every((child) =>
				conditionApplies(child, state, hero, enemy),
			);
		case "or":
			return condition.children.some((child) =>
				conditionApplies(child, state, hero, enemy),
			);
		case "not":
			return !conditionApplies(condition.child, state, hero, enemy);
		case "has_condition": {
			if (condition.of === "$enemy") {
				if (!enemy) return false;
				if (condition.conditionType === "boss_or_subboss") {
					return enemy.id === "boss" || Boolean(enemy.isSubboss);
				}
				return enemy.conditions.includes(condition.conditionType);
			}
			if (condition.of === "$source" || condition.of === "$self") {
				return hero.conditions.includes(condition.conditionType);
			}
			return false;
		}
		case "has_skill": {
			const targetId =
				condition.of === "$source" || condition.of === "$self"
					? hero.cardId
					: condition.of === "$enemy"
						? enemy?.cardId
						: null;
			return targetId
				? cardSkills(targetId).some(({ def }) => def.id === condition.skillId)
				: false;
		}
		case "compare":
			return compareValues(
				resolveNumber(condition.left, {}, state.despertar),
				resolveNumber(condition.right, {}, state.despertar),
				condition.op,
			);
	}
}

function compareValues(
	left: number,
	right: number,
	op: "lt" | "lte" | "eq" | "gte" | "gt" | "in",
): boolean {
	switch (op) {
		case "lt":
			return left < right;
		case "lte":
			return left <= right;
		case "eq":
			return left === right;
		case "gte":
			return left >= right;
		case "gt":
			return left > right;
		case "in":
			return left === right;
	}
}

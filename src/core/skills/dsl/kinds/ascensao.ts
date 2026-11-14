import { z } from "zod";
import { defineCondition, type RefResolver } from "../../../../engine/kinds";
import type { GameKindPackage } from "../../../gameEngine";
import { recordEvent } from "../../../events/record";
import { applyPoisonStatus } from "../../../rules/poison";
import { poisonOriginLabel } from "../../../rules/poisonTelemetry";
import { applyDamageOverTimeStatus, matchesDamageOverTimeStatus, parseDamageOverTimeCondition } from "../../../rules/damageOverTime";
import { discardFromDungeonDeck } from "../../../reducer/exploration";
import { log, mapEnemy, mapHero, shuffleRng } from "../../../reducer/utils";
import type { ColorIndex } from "../../../state/color";
import type {
	BlockEntry,
	GameState,
	PendingReward,
} from "../../../state/gameState";
import { resolveEntityRef, resolveExpr } from "../resolveExpr";
import {
	ASCENSAO_DAMAGE_TYPES,
	ASCENSAO_MODIFIER_STATS,
} from "../modifierStats";
import { DurationNodeSchema, ExprNodeSchema } from "../schema";
import type { EvalCtx } from "../types";
import {
	effectKind,
	type GameKind,
	targetOf,
	unresolvedEntityRef,
} from "./shared";

import { awakeningOf, deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks, withUnitStats, withPendingSkillChoice } from "../../../state/access";
import { gameOf, withGame } from "../../../../engine/state";
const MAX_DUNGEON_LEVEL: ColorIndex = 4;

const DRAW_PILES = ["dungeon", "item_deck", "artifact_deck"] as const;
const DISCARD_PILES = ["dungeon", "item"] as const;
const BLOCK_TARGETS = [
	"flee",
	"heal",
	"dungeon_discard",
	"power_use",
	"dungeon_level_reduction",
] as const;
const REWARD_TYPES = ["item", "artifact"] as const;

function discardFirstAvailableItem(state: GameState): GameState {
	const heroWithBackpack = heroesOf(state).find(
		(h) => h.status === "active" && h.backpack.length > 0,
	);
	if (heroWithBackpack) {
		const [removed, ...rest] = heroWithBackpack.backpack;
		return log(
			mapHero(state, heroWithBackpack.id, (h) => ({ ...h, backpack: rest })),
			`Tributo: ${removed} descartado da mochila.`,
		);
	}
	const heroWithItem = heroesOf(state).find(
		(h) => h.status === "active" && Object.values(h.activeItems).some(Boolean),
	);
	if (heroWithItem) {
		const slot = (
			Object.keys(
				heroWithItem.activeItems,
			) as (keyof typeof heroWithItem.activeItems)[]
		).find((k) => heroWithItem.activeItems[k]);
		if (slot) {
			return log(
				mapHero(state, heroWithItem.id, (h) => {
					const items = { ...h.activeItems };
					delete items[slot];
					return { ...h, activeItems: items };
				}),
				`Tributo: ${heroWithItem.activeItems[slot]} descartado.`,
			);
		}
	}
	return log(state, "Tributo: nenhum item disponível para descartar.");
}

const advanceDungeon = effectKind({
	kind: "i_advance_dungeon",
	aliases: ["advance_dungeon_level"],
	schema: z.object({
		kind: z.literal("i_advance_dungeon"),
		amount: ExprNodeSchema,
	}),
	evaluate: (node, ctx) => {
		const amount = resolveExpr(node.amount, ctx);
		return ctx.action.pushEffect({ kind: "i_advance_dungeon", amount });
	},
	resolve: (state, effect) => {
		const amount = (effect["amount"] as number) ?? 1;
		const newLevel = Math.min(
			MAX_DUNGEON_LEVEL,
			awakeningOf(state) + amount,
		) as ColorIndex;
		return log(
			recordEvent(withAwakening(state, newLevel), "DespertarChanged", {
				from: awakeningOf(state),
				to: newLevel,
				cause: "effect",
			}),
			`Despertar avançou para nível ${newLevel}.`,
		);
	},
});

const recoverDungeon = effectKind({
	kind: "i_recover_dungeon",
	aliases: ["recover_dungeon"],
	schema: z.object({
		kind: z.literal("i_recover_dungeon"),
		count: ExprNodeSchema,
	}),
	evaluate: (node, ctx) => {
		const count = resolveExpr(node.count, ctx);
		return ctx.action.pushEffect({ kind: "i_recover_dungeon", count });
	},
	resolve: (state, effect) => {
		const count = (effect["count"] as number) ?? 1;
		const { discarded } = deckOf(state, "dungeonDeck");
		if (discarded.length === 0)
			return log(state, "Descarte de dungeon vazio — nada a recuperar.");
		const toRecover = discarded.slice(0, count);
		const remaining = discarded.slice(count);
		const { value: reshuffled, next: rng } = shuffleRng(
			[...deckOf(state, "dungeonDeck").available, ...toRecover],
			gameOf(state).rng,
		);
		return log(
			withDecks(withGame(state, (prevGame) => ({ ...prevGame, rng })), {
					...decksOf(state),
					dungeonDeck: {
						...deckOf(state, "dungeonDeck"),
						available: reshuffled,
						discarded: remaining,
					},
				}),
			`${count} carta(s) de dungeon recuperada(s) do descarte.`,
		);
	},
});

const revealDungeon = effectKind({
	kind: "i_reveal_dungeon",
	aliases: ["reveal_dungeon"],
	schema: z.object({
		kind: z.literal("i_reveal_dungeon"),
		count: ExprNodeSchema,
	}),
	evaluate: (node, ctx) => {
		const count = resolveExpr(node.count, ctx);
		return ctx.action.pushEffect({ kind: "i_reveal_dungeon", count });
	},
	resolve: (state, effect, { pending }) => {
		const count = (effect["count"] as number) ?? 1;
		const skillId = (pending.source as string | undefined) ?? "reveal_dungeon";
		const topCards = deckOf(state, "dungeonDeck").available.slice(0, count);
		if (topCards.length === 0) return log(state, "Deck de dungeon vazio.");
		const options = [
			...topCards.map((name, i) => ({
				id: `card_${i}`,
				label: name as string,
			})),
			{ id: "ok", label: "Confirmar (manter ordem atual)" },
		];
		return withPendingSkillChoice(state, {
				skillId,
				prompt: `Próxima(s) ${topCards.length} carta(s) do deck de dungeon:`,
				options,
			});
	},
});

const grantReward = effectKind({
	kind: "i_grant_reward",
	aliases: ["grant_pending_reward"],
	vocabulary: { rewardType: REWARD_TYPES },
	schema: z.object({
		kind: z.literal("i_grant_reward"),
		rewardType: z.enum(REWARD_TYPES),
		cardId: z.string(),
	}),
	evaluate: (node, ctx) =>
		ctx.action.pushEffect({
			kind: "i_grant_reward",
			rewardType: node.rewardType,
			cardId: node.cardId,
		}),
	resolve: (state, effect) => {
		const cardId = (effect["cardId"] ?? effect["cardName"]) as string;
		const rewardType = effect["rewardType"] as "item" | "artifact";
		if (rewardType === "artifact") {
			return log(
				withGame(state, (prevGame) => ({ ...prevGame, groupArtifacts: [
						...gameOf(state).groupArtifacts,
						{ cardId, carriedBy: null },
					] })),
				`${cardId} ativado como artefato do grupo.`,
			);
		}
		const reward: PendingReward = {
			type: rewardType,
			cardId,
			requiresBearer: false,
		};
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: [...gameOf(state).pendingRewards, reward] })),
			`${cardId} adicionado às recompensas pendentes.`,
		);
	},
});

const setNoReward = effectKind({
	kind: "i_set_no_reward",
	aliases: ["set_no_reward"],
	schema: z.object({ kind: z.literal("i_set_no_reward"), to: z.string() }),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({ kind: "i_set_no_reward", to });
	},
	resolve: (state, effect) => {
		const targetId = targetOf(effect);
		if (!targetId) return state;
		return log(
			mapEnemy(state, targetId, (e) => ({ ...e, noReward: true })),
			`${targetId}: sem recompensas ao ser derrotado.`,
		);
	},
});

const preventDungeonDiscard = effectKind({
	kind: "i_prevent_dungeon_discard",
	aliases: ["prevent_dungeon_discard"],
	schema: z.object({ kind: z.literal("i_prevent_dungeon_discard") }),
	evaluate: (_node, ctx) =>
		ctx.action.pushEffect({ kind: "i_prevent_dungeon_discard" }),
	resolve: (state) =>
		log(
			withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, dungeonDiscardPrevented: true } })),
			"Próximo descarte de dungeon será prevenido.",
		),
});

const draw = effectKind({
	kind: "i_draw",
	aliases: ["draw_from"],
	vocabulary: { pile: DRAW_PILES },
	schema: z.object({
		kind: z.literal("i_draw"),
		pile: z.enum(DRAW_PILES),
		count: ExprNodeSchema,
	}),
	evaluate: (node, ctx) => {
		const count = resolveExpr(node.count, ctx);
		return ctx.action.pushEffect({
			kind: "i_draw",
			pile: node.pile,
			count,
		});
	},
	resolve: (state, effect) => {
		const pile = effect["pile"] as string;
		const count = (effect["count"] as number) ?? 1;
		if (pile === "artifact_deck") {
			const { available } = deckOf(state, "artifactDeck");
			const drawn = available.slice(0, count);
			if (drawn.length === 0)
				return log(state, "Deck de artefatos vazio — nenhum artefato sacado.");
			return log(
				withDecks(withGame(state, (prevGame) => ({ ...prevGame, groupArtifacts: [
						...gameOf(state).groupArtifacts,
						...drawn.map((name) => ({
							cardId: name as string,
							carriedBy: null,
						})),
					] })), {
						...decksOf(state),
						artifactDeck: {
							...deckOf(state, "artifactDeck"),
							available: available.slice(count),
						},
					}),
				`${drawn.length} artefato(s) sacado(s) e ativado(s) no grupo.`,
			);
		}
		if (pile === "item_deck") {
			const { available } = deckOf(state, "itemDeck");
			const drawn = available.slice(0, count);
			if (drawn.length === 0)
				return log(state, "Deck de itens vazio — nenhum item sacado.");
			const newRewards: PendingReward[] = drawn.map((name) => ({
				type: "item" as const,
				cardId: name as string,
				requiresBearer: false,
			}));
			return log(
				withDecks(withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: [...gameOf(state).pendingRewards, ...newRewards] })), {
						...decksOf(state),
						itemDeck: {
							...deckOf(state, "itemDeck"),
							available: available.slice(count),
						},
					}),
				`${drawn.length} item(s) sacado(s).`,
			);
		}
		return state;
	},
});

const discard = effectKind({
	kind: "i_discard",
	aliases: ["discard_from"],
	vocabulary: { pile: DISCARD_PILES },
	schema: z.object({
		kind: z.literal("i_discard"),
		pile: z.enum(DISCARD_PILES),
		count: ExprNodeSchema,
		who: z.string().optional(),
	}),
	evaluate: (node, ctx) => {
		const count = resolveExpr(node.count, ctx);
		return ctx.action.pushEffect({
			kind: "i_discard",
			pile: node.pile,
			count,
		});
	},
	resolve: (state, effect, { engine }) => {
		const pile = effect["pile"] as string;
		const count = (effect["count"] as number) ?? 1;
		if (pile === "dungeon") {
			return discardFromDungeonDeck(engine, state, count);
		}
		if (pile === "item") {
			let next = state;
			for (let i = 0; i < count; i++) {
				next = discardFirstAvailableItem(next);
			}
			return next;
		}
		return state;
	},
});

const drawAndChoose = effectKind({
	kind: "i_draw_and_choose",
	aliases: ["draw_and_choose"],
	vocabulary: { pile: DRAW_PILES },
	schema: z.object({
		kind: z.literal("i_draw_and_choose"),
		pile: z.enum(DRAW_PILES),
		reveal: ExprNodeSchema,
		keep: ExprNodeSchema,
		replace_room_loot: z.boolean().optional(),
	}),
	evaluate: (node, ctx) => {
		const reveal = resolveExpr(node.reveal, ctx);
		const keep = resolveExpr(node.keep, ctx);
		return ctx.action.pushEffect({
			kind: "i_draw_and_choose",
			pile: node.pile,
			reveal,
			keep,
			replace_room_loot: node.replace_room_loot,
		});
	},
	resolve: (state, effect, { pending }) => {
		const pile = effect["pile"] as string;
		const reveal = (effect["reveal"] as number) ?? 2;
		const skillId = (pending.source as string | undefined) ?? "draw_and_choose";
		const deckKey =
			pile === "item_deck"
				? "itemDeck"
				: pile === "artifact_deck"
					? "artifactDeck"
					: null;
		if (!deckKey) return state;
		const deck = decksOf(state)[deckKey];
		const drawn = deck.available.slice(0, reveal);
		if (drawn.length === 0)
			return log(state, "Deck vazio — nenhuma carta revelada.");
		const rewardType: "item" | "artifact" =
			pile === "item_deck" ? "item" : "artifact";
		const options = drawn.map((name) => ({
			id: name as string,
			label: name as string,
			effect: [
				{
					kind: "i_grant_reward" as const,
					rewardType,
					cardId: name as string,
				},
			],
		}));
		return log(
			withDecks(withPendingSkillChoice(withGame(state, (prevGame) => ({ ...prevGame, flags: effect["replace_room_loot"]
					? { ...gameOf(state).flags, roomLootReplaced: true }
					: gameOf(state).flags })), {
					skillId,
					prompt: "Escolha 1 carta para ficar (as outras são descartadas):",
					kind: "draw_and_choose",
					discardDeck: deckKey,
					options,
				}), {
					...decksOf(state),
					[deckKey]: { ...deck, available: deck.available.slice(reveal) },
				}),
			`${drawn.length} carta(s) revelada(s) para escolha.`,
		);
	},
});

const block = effectKind({
	kind: "p_block",
	aliases: ["block_action"],
	vocabulary: { what: BLOCK_TARGETS },
	schema: z.object({
		kind: z.literal("p_block"),
		what: z.enum(BLOCK_TARGETS),
		duration: DurationNodeSchema.optional(),
		sourceEntityId: z.string().optional(),
	}),
	evaluate: (node, ctx) =>
		ctx.action.pushEffect({
			kind: "p_block",
			what: node.what,
			duration: node.duration,
			sourceEntityId: ctx.sourceId ?? undefined,
		}),
	resolve: (state, effect, { pending }) => {
		const what = effect["what"] as string;
		const durationNode = effect["duration"] as
			| import("../types").DurationNode
			| undefined;
		const blockSourceEntityId = effect["sourceEntityId"] as string | undefined;
		const entry: BlockEntry = {
			source: pending.source ?? "unknown",
			duration: durationNode ?? { kind: "permanent" },
			...(blockSourceEntityId ? { sourceEntityId: blockSourceEntityId } : {}),
		};
		const appendBlock = (key: string, flag: string, message: string) => {
			const entries = gameOf(state).blocks[key] ?? [];
			const alreadyPresent = entries.some(
				(existing) =>
					existing.source === entry.source &&
					existing.sourceEntityId === entry.sourceEntityId &&
					existing.duration.kind === entry.duration.kind,
			);
			if (alreadyPresent) return state;
			return log(
				withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, [flag]: true }, blocks: { ...gameOf(state).blocks, [key]: [...entries, entry] } })),
				message,
			);
		};
		switch (what) {
			case "flee": {
				return appendBlock("fleeBlocked", "fleeBlocked", "Fuga bloqueada.");
			}
			case "heal": {
				const who = effect["who"] as string | undefined;
				let next = state;
				const targets = who
					? [who]
					: heroesOf(state).filter((h) => h.status === "active").map((h) => h.id);
				for (const heroId of targets) {
					const key = `${heroId}::healBlocked`;
					next = withUnitStats(next, heroId, { healBlocked: true });
					next = withGame(next, (prevGame) => ({ ...prevGame, blocks: {
							...gameOf(next).blocks,
							[key]: [...(gameOf(next).blocks[key] ?? []), entry],
						} }));
				}
				return log(next, "Cura bloqueada.");
			}
			case "dungeon_discard": {
				return appendBlock(
					"discardDungeonLocked",
					"discardDungeonLocked",
					"Prevenção de descarte de dungeon bloqueada.",
				);
			}
			case "power_use":
				return appendBlock(
					"powerUseBlocked",
					"powerUseBlocked",
					"Uso de poder bloqueado.",
				);
			case "dungeon_level_reduction":
				return appendBlock(
					"dungeonLevelReductionBlocked",
					"dungeonLevelReductionBlocked",
					"Redução do Despertar bloqueada.",
				);
		}
		return state;
	},
});

const hasCondition = defineCondition<never, never, EvalCtx>({
	kind: "has_condition",
	schema: z.object({
		kind: z.literal("has_condition"),
		of: z.string(),
		conditionType: z.string(),
	}),
	test: (node, ctx) => {
		const of = node["of"] as string;
		const conditionType = node["conditionType"] as string;
		if (conditionType === "marked") {
			const sourceHeroId = ctx.sourceId;
			const enemyId = ctx.targetIds.find((id) =>
				enemiesOf(ctx.state).some((enemy) => enemy.id === id),
			);
			if (
				sourceHeroId &&
				enemyId &&
				gameOf(ctx.state).combat?.preyByHero[sourceHeroId] === enemyId
			)
				return true;
		}
		const entityId = resolveEntityRef(of, ctx);
		if (!entityId) return false;
		const hero = heroesOf(ctx.state).find((h) => h.id === entityId);
		if (hero) return hero.conditions.some((value) => value === conditionType || matchesDamageOverTimeStatus(value, conditionType));
		const enemy = enemiesOf(ctx.state).find((e) => e.id === entityId);
		if (!enemy) return false;
		if (conditionType === "boss_or_subboss") {
			return enemy.id === "boss" || Boolean(enemy.isSubboss);
		}
		return enemy.conditions.some((value) => value === conditionType || matchesDamageOverTimeStatus(value, conditionType));
	},
});

function lifeOf(
	ctx: EvalCtx,
	entityId: string,
	prop: "currentLife" | "maxLife",
): number | undefined {
	const hero = heroesOf(ctx.state).find((h) => h.id === entityId);
	if (hero) return prop === "currentLife" ? hero.currentLife : hero.maxLife;
	const enemy = enemiesOf(ctx.state).find((e) => e.id === entityId);
	if (enemy) return prop === "currentLife" ? enemy.currentLife : enemy.maxLife;
	return undefined;
}

const ascensaoRefs: RefResolver<EvalCtx>[] = [
	{
		id: "ascensao.entity.enemy",
		space: "entity",
		resolve: (ref, ctx) =>
			ref === "$enemy"
				? (ctx.targetIds.find((id) =>
						enemiesOf(ctx.state).some((enemy) => enemy.id === id),
					) ?? null)
				: undefined,
	},
	{
		id: "ascensao.modifier_stat",
		space: "modifier_stat",
		resolve: (stat) => ASCENSAO_MODIFIER_STATS[stat],
	},
	{
		id: "ascensao.damage_type",
		space: "damage_type",
		resolve: (type) => (ASCENSAO_DAMAGE_TYPES.includes(type) ? type : undefined),
	},
	{
		id: "ascensao.index.despertar",
		space: "index",
		resolve: (_ref, ctx) => awakeningOf(ctx.state),
	},
	{
		id: "ascensao.number.state",
		space: "number",
		resolve: (ref, ctx) => {
			const name = ref.slice(1);
			switch (name) {
				case "dungeon.level":
					return ctx.query.dungeonLevel();
				case "room.enemy_count":
					return ctx.query.roomEnemyCount();
				case "self.currentLife":
				case "self.maxLife": {
					const entityId = ctx.sourceId;
					if (!entityId)
						throw new Error(`[resolveExpr] $${name} requer sourceId`);
					const value = lifeOf(
						ctx,
						entityId,
						name === "self.currentLife" ? "currentLife" : "maxLife",
					);
					if (value !== undefined) return value;
					throw new Error(
						`[resolveExpr] entidade "${entityId}" não encontrada para $${name}`,
					);
				}
			}
			return undefined;
		},
	},
	{
		id: "ascensao.number.entity-property",
		space: "number",
		priority: 1,
		resolve: (ref, ctx) => {
			const name = ref.slice(1);
			if (!name.includes(".")) return undefined;
			const [entity, prop] = name.split(".", 2) as [string, string];
			const entityId = resolveEntityRef(`$${entity}`, ctx);
			if (!entityId) return undefined;
			if (prop !== "currentLife" && prop !== "maxLife") return undefined;
			return lifeOf(ctx, entityId, prop);
		},
	},
	{
		id: "ascensao.entity.lowest-life-hero",
		space: "entity",
		resolve: (ref, ctx) =>
			ref === "$lowest_life_hero" ? ctx.query.heroWithLowestLife() : undefined,
	},
	{
		id: "ascensao.entities.heroes-enemies",
		space: "entities",
		resolve: (ref, ctx) => {
			switch (ref) {
				case "$each":
					return ctx.targetIds.length > 0
						? ctx.targetIds
						: heroesOf(ctx.state)
								.filter((h) => h.status === "active")
								.map((h) => h.id);
				case "all_heroes":
					return heroesOf(ctx.state)
						.filter((h) => h.status === "active")
						.map((h) => h.id);
				case "all_enemies":
					return enemiesOf(ctx.state)
						.filter((e) => e.status === "active")
						.map((e) => e.id);
			}
			return undefined;
		},
	},
];

const applyDamageOverTimeKind = effectKind({
	kind: "i_apply_damage_over_time",
	schema: z.object({
		kind: z.literal("i_apply_damage_over_time"),
		to: z.string(),
		status: z.string().min(1),
		effectId: z.string().min(1).optional(),
		damage: ExprNodeSchema,
		rounds: ExprNodeSchema,
		increaseOverTime: z.boolean().optional(),
		decreaseOverTime: z.boolean().optional(),
	}).refine((value) => !(value.increaseOverTime && value.decreaseOverTime), {
		message: "increaseOverTime e decreaseOverTime não podem ser true simultaneamente",
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({
			kind: "i_apply_damage_over_time", to,
			status: node.status, effectId: node.effectId ?? ctx.skillId,
			sourceId: ctx.sourceId ?? "system",
			damage: resolveExpr(node.damage, ctx),
			rounds: resolveExpr(node.rounds, ctx),
			increaseOverTime: node.increaseOverTime ?? false,
			decreaseOverTime: node.decreaseOverTime ?? false,
		});
	},
	resolve: (state, effect) => applyDamageOverTimeStatus(
		state, targetOf(effect) ?? "", {
			status: String(effect["status"] ?? ""),
			sourceId: String(effect["sourceId"] ?? ""),
			effectId: String(effect["effectId"] ?? ""),
			damage: Number(effect["damage"]),
			rounds: Number(effect["rounds"]),
			increaseOverTime: effect["increaseOverTime"] === true,
			decreaseOverTime: effect["decreaseOverTime"] === true,
		},
	),
});


/** Generic poison ward and selective stack removal for expansion items. */
const poisonWardKind = effectKind({
  kind: "i_poison_ward",
  schema: z.object({
    kind: z.literal("i_poison_ward"),
    to: z.string(),
    mode: z.enum(["remove_one", "block_next", "reduce_next"]),
    value: z.number().int().positive().default(1),
    removerSourceId: z.string().optional(),
    removerSkillId: z.string().optional(),
  }),
  evaluate: (node, ctx) => {
    const to = resolveEntityRef(node.to, ctx);
    if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
    return ctx.action.pushEffect({ kind: "i_poison_ward", to, mode: node.mode, value: node.value,
      removerSkillId: ctx.skillId, removerSourceId: ctx.sourceId ?? "system" });
  },
  resolve: (state, effect) => {
    const entity = targetOf(effect);
    const mode = String(effect["mode"]);
    const amount = Number(effect["value"] ?? 1);
    const unit = [...heroesOf(state), ...enemiesOf(state)].find(u => u.id === entity);
    if (!unit || !Number.isSafeInteger(amount) || amount < 1) return state;
    if (mode === "remove_one") {
      const index = unit.conditions.findIndex(c => matchesDamageOverTimeStatus(c, "poison") || c.startsWith("poison:"));
      if (index < 0) return state;
      return withUnitStats(state, unit.id, { conditions: unit.conditions.filter((_, i) => i !== index) },
        { reason: "antidote", by: poisonOriginLabel(state, String(effect["removerSourceId"] ?? "system"),
          String(effect["removerSkillId"] ?? "i_poison_ward")) });
    }
    const prefix = "poison_ward:" + mode + ":";
    const existing = unit.conditions.find(c => c.startsWith(prefix));
    const previous = existing ? Number(existing.slice(prefix.length)) : 0;
    return withUnitStats(state, unit.id, {
      conditions: [...unit.conditions.filter(c => !c.startsWith(prefix)), prefix + (Math.max(0, previous) + amount)],
    });
  },
});

const hasDotStacks = defineCondition<never, never, EvalCtx>({
  kind: "has_dot_stacks",
  schema: z.object({
    kind: z.literal("has_dot_stacks"),
    of: z.string(),
    status: z.string().min(1),
    minimum: z.number().int().positive(),
  }),
  test: (node, ctx) => {
    const id = resolveEntityRef(node["of"] as string, ctx);
    const unit = [...heroesOf(ctx.state), ...enemiesOf(ctx.state)].find(u => u.id === id);
    if (!unit) return false;
    const status = String(node["status"]);
    const count = unit.conditions.filter(raw => parseDamageOverTimeCondition(raw)?.status === status ||
      (status === "poison" && raw.startsWith("poison:"))).length;
    return count >= Number(node["minimum"]);
  },
});

const applyPoisonKind = effectKind({
	kind: "i_apply_poison",
	schema: z.object({
		kind: z.literal("i_apply_poison"),
		to: z.string(),
		damage: ExprNodeSchema,
		rounds: ExprNodeSchema,
		sourceId: z.string().optional(),
		effectId: z.string().optional(),
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({
			kind: "i_apply_poison", to,
			sourceId: ctx.sourceId ?? "system", effectId: ctx.skillId,
			damage: resolveExpr(node.damage, ctx), rounds: resolveExpr(node.rounds, ctx),
		});
	},
	resolve: (state, effect) => applyPoisonStatus(
		state, targetOf(effect) ?? "", Number(effect["damage"]), Number(effect["rounds"]), {
			sourceId: String(effect["sourceId"] ?? "legacy_unknown"),
			effectId: String(effect["effectId"] ?? "legacy_poison"),
		},
	),
});

export const ascensaoPackage: GameKindPackage = {
	id: "ascensao-heroica",
	kinds: [
		poisonWardKind,
		hasDotStacks as unknown as GameKind,
		applyDamageOverTimeKind,
		applyPoisonKind,
		advanceDungeon,
		recoverDungeon,
		revealDungeon,
		grantReward,
		setNoReward,
		preventDungeonDiscard,
		draw,
		discard,
		drawAndChoose,
		block,
		hasCondition as unknown as GameKind,
	],
	refs: ascensaoRefs,
};

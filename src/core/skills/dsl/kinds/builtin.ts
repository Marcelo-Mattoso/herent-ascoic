import { z } from "zod";
import { defineCondition, type RefResolver } from "../../../../engine/kinds";
import type { Duration, ModifierComponent } from "../../../ecs/types";
import {
	addComponent,
	createEntity,
	removeComponent,
	upsertEntity,
} from "../../../ecs/world";
import { log } from "../../../reducer/utils";
import { matchesDamageOverTimeStatus } from "../../../rules/damageOverTime";
import { skillById, skillOptionLabel } from "../../../gameEngine";
import type { GameKindPackage } from "../../../gameEngine";
import { applyDamage } from "../../../systems/damageSystem";
import {
	applyFullHeal,
	applyHeal,
	applySurvive,
} from "../../../systems/healSystem";
import { evaluate } from "../evaluate";
import {
	BUILTIN_DAMAGE_TYPES,
	BUILTIN_MODIFIER_STATS,
} from "../modifierStats";
import { resolveCondition, resolveValue } from "../resolveCondition";
import {
	resolveEntityListRef,
	resolveEntityRef,
	resolveExpr,
} from "../resolveExpr";
import {
	DurationNodeSchema,
	ExprNodeSchema,
} from "../schema";
import type { ConditionNode, DurationNode, EffectNode, EvalCtx } from "../types";
import {
	asKindNode,
	ConditionLike,
	effectKind,
	type GameKind,
	NodeList,
	targetOf,
	unresolvedEntityRef,
	modifierStatSpec,
} from "./shared";

import { deckOf, enemiesOf, heroesOf, withScopedFlag, withUnitStats, withWorld, worldOf } from "../../../state/access";
import { gameOf, withGame } from "../../../../engine/state";
const DIE_SIDES = ["hero", "enemy", "any"] as const;
const FOR_EACH_OVER = [
	"targets",
	"allies",
	"enemies",
	"all_heroes",
	"$each",
] as const;

function mapDuration(d: DurationNode): Duration {
	switch (d.kind) {
		case "once":
			return { kind: "once" };
		case "until_end_of_round":
			return { kind: "this_turn" };
		case "until_end_of_combat":
			return { kind: "this_combat" };
		case "while_in_play":
			return { kind: "while_source_in_play" };
		case "permanent":
		case "passive":
			return { kind: "permanent" };
		case "once_per_round":
			return { kind: "rounds", remaining: 1 };
	}
}

const damage = effectKind({
	kind: "i_damage",
	aliases: ["apply_damage"],
	schema: z.object({
		kind: z.literal("i_damage"),
		to: z.string(),
		amount: ExprNodeSchema,
		minimum: z.number().optional(),
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		const amount = resolveExpr(node.amount, ctx);
		const clamped =
			node.minimum !== undefined ? Math.max(node.minimum, amount) : amount;
		return ctx.action.pushEffect({
			kind: "i_damage",
			to,
			amount: clamped,
		});
	},
	resolve: (state, effect, { engine, pending }) => {
		const targetId = targetOf(effect);
		if (!targetId) return state;
		const amount = effect["amount"] as number;
		const sourceSkill = skillById(engine, pending.source);
		return applyDamage(engine, state, targetId, amount, {
			sourceId: pending.source,
			damageType: sourceSkill?.rules?.damageType ?? "physical",
		});
	},
});

const heal = effectKind({
	kind: "i_heal",
	aliases: ["apply_heal"],
	schema: z.object({
		kind: z.literal("i_heal"),
		to: z.string(),
		amount: ExprNodeSchema,
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		const amount = resolveExpr(node.amount, ctx);
		return ctx.action.pushEffect({ kind: "i_heal", to, amount });
	},
	resolve: (state, effect, { engine }) => {
		const targetId = targetOf(effect);
		if (!targetId) return state;
		const amount = effect["amount"] as number;
		return applyHeal(engine, state, targetId, amount);
	},
});

const fullHeal = effectKind({
	kind: "i_full_heal",
	aliases: ["apply_full_heal"],
	schema: z.object({ kind: z.literal("i_full_heal"), to: z.string() }),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({ kind: "i_full_heal", to });
	},
	resolve: (state, effect, { engine }) => {
		const targetId = targetOf(effect);
		if (!targetId) return state;
		return applyFullHeal(engine, state, targetId);
	},
});

const preventDestroy = effectKind({
	kind: "i_prevent_destroy",
	aliases: ["prevent_destroy"],
	schema: z.object({ kind: z.literal("i_prevent_destroy"), to: z.string() }),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({ kind: "i_prevent_destroy", to });
	},
	resolve: (state, effect) => {
		const targetId = targetOf(effect);
		if (!targetId) return state;
		return applySurvive(state, targetId);
	},
});

const modifier = effectKind({
	kind: "p_modifier",
	aliases: ["add_modifier"],
	schema: z.object({
		kind: z.literal("p_modifier"),
		to: z.string(),
		stat: z.string().min(1),
		operation: z.enum(["add", "multiply", "set"]),
		value: ExprNodeSchema,
		duration: DurationNodeSchema,
		condition: ConditionLike.optional(),
		sourceEntityId: z.string().optional(),
	}),
	children: (node) =>
		node.condition ? [asKindNode(node.condition as ConditionNode)] : [],
	refsOf: (node) => [{ space: "modifier_stat", ref: node.stat }],
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		const value = resolveExpr(node.value, ctx);
		return ctx.action.pushEffect({
			kind: "p_modifier",
			to,
			stat: node.stat,
			operation: node.operation,
			value,
			duration: node.duration,
			sourceEntityId: ctx.sourceId ?? undefined,
		});
	},
	resolve: (state, effect, { engine, pending }) => {
		const targetId = targetOf(effect);
		const entityId = targetId ?? (effect["to"] as string | undefined);
		if (!entityId) return state;
		const stat = effect["stat"] as string;
		const value = effect["value"] as number;
		const source = pending.source;
		const durationNode = effect["duration"] as
			| { kind: string; remaining?: number }
			| undefined;
		const sourceEntityId = effect["sourceEntityId"] as string | undefined;

		const statSpec = modifierStatSpec(engine, stat);
		const ecsTarget = statSpec?.target;

		function mapDurationNode(
			d: { kind: string; remaining?: number } | undefined,
		): Duration {
			if (!d) return { kind: "this_combat" };
			switch (d.kind) {
				case "once":
					return { kind: "once" };
				case "until_end_of_round":
					return { kind: "this_turn" };
				case "until_end_of_combat":
					return { kind: "this_combat" };
				case "while_in_play":
					return { kind: "while_source_in_play" };
				case "passive":
				case "permanent":
					return { kind: "permanent" };
				case "once_per_round":
					return { kind: "rounds", remaining: 1 };
				default:
					return { kind: "this_combat" };
			}
		}

		let worldState = state;
		if (ecsTarget) {
			const ecsValue = statSpec?.negate ? -value : value;
			const ecsDuration = mapDurationNode(durationNode);
			const modComp: ModifierComponent = {
				type: "modifier",
				target: ecsTarget,
				operation: "add",
				value: ecsValue,
				source,
				duration: ecsDuration,
				...(ecsDuration.kind === "while_source_in_play" && sourceEntityId
					? { sourceEntityId }
					: {}),
			};
			let world = worldOf(worldState);
			if (!world.entities[entityId]) {
				const isActiveHero = gameOf(worldState).heroes.some(
					(h) => h.id === entityId && h.status === "active",
				);
				const isActiveEnemy = gameOf(worldState).activeEnemies.some(
					(e) => e.id === entityId && e.status === "active",
				);
				if (!isActiveHero && !isActiveEnemy) return worldState;
				world = upsertEntity(
					world,
					createEntity(entityId, isActiveHero ? "hero" : "enemy"),
				);
			}
			if (
				statSpec?.dedup !== false &&
				ecsDuration.kind === "while_source_in_play" &&
				sourceEntityId
			) {
				world = removeComponent(world, entityId, (c) => {
					if (c.type !== "modifier") return false;
					const m = c as ModifierComponent;
					return (
						m.duration.kind === "while_source_in_play" &&
						m.source === source &&
						m.target === ecsTarget &&
						m.sourceEntityId === sourceEntityId
					);
				});
			}
			world = addComponent(world, entityId, modComp);
			worldState = withWorld(worldState, world);
		}
		return worldState;
	},
});

const trigger = effectKind({
	kind: "add_trigger",
	schema: z.object({
		kind: z.literal("add_trigger"),
		to: z.string(),
		on: z.string(),
		effect: NodeList,
		duration: DurationNodeSchema,
		condition: ConditionLike.optional(),
		priority: z.number().optional(),
	}),
	children: (node) => [
		...(node.effect as readonly import("../../../../engine/kinds").KindNode[]),
		...(node.condition ? [asKindNode(node.condition)] : []),
	],
	evaluate: (node, ctx) => {
		const entityId = resolveEntityRef(node.to, ctx);
		if (!entityId) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.addComponent(entityId, {
			type: "trigger",
			on: node.on,
			effect:
				node.effect as unknown as import("../../../ecs/types").EffectDescriptor,
			source: ctx.skillId,
			sourceEntityId: ctx.sourceId ?? undefined,
			duration: mapDuration(node.duration),
			priority: node.priority ?? 0,
			condition: undefined,
		});
	},
});

const ifKind = effectKind({
	kind: "i_if",
	schema: z.object({
		kind: z.literal("i_if"),
		when: ConditionLike,
		then: NodeList,
		else: NodeList.optional(),
	}),
	children: (node) => [
		asKindNode(node.when),
		...(node.then as never[]),
		...((node.else ?? []) as never[]),
	],
	evaluate: (node, ctx) => {
		const cond = resolveCondition(node.when, ctx);
		const branch = cond ? node.then : (node.else ?? []);
		return evaluate(branch, ctx);
	},
});

const unavailableDiscardPenalty: readonly EffectNode[] = [
	{
		kind: "i_for_each", over: "all_heroes", as: "$hero",
		do: [{ kind: "p_modifier", to: "$target", stat: "s_damage_dealt", operation: "add", value: -1, duration: { kind: "until_end_of_combat" } }],
	},
	{
		kind: "i_for_each", over: "all_heroes", as: "$hero",
		do: [{ kind: "p_modifier", to: "$target", stat: "s_hit_penalty", operation: "add", value: 1, duration: { kind: "until_end_of_combat" } }],
	},
];

const chooseOne = effectKind({
	kind: "i_choose_one",
	schema: z.object({
		kind: z.literal("i_choose_one"),
		allow_skip: z.boolean().optional(),
		options: z
			.array(
				z.object({
					id: z.string().regex(/^[a-z_][a-z0-9_]*$/),
					params: z
						.record(z.string(), z.union([z.number(), z.string()]))
						.optional(),
					effect: NodeList,
				}),
			)
			.min(2),
	}),
	children: (node) =>
		node.options.flatMap((option) => option.effect as never[]),
	evaluate: (node, ctx) => {
		const [itemOption, alternative] = node.options;
		if (node.options.length === 2 && itemOption && alternative &&
			(itemOption.effect as readonly EffectNode[]).some((effect) => effect.kind === "i_discard" && effect.pile === "item")) {
			const availableItems = heroesOf(ctx.state)
				.filter((hero) => hero.status === "active")
				.reduce((count, hero) => count + hero.backpack.length + Object.values(hero.activeItems).filter(Boolean).length, 0);
			const discardCount = (option: typeof itemOption, pile: "item" | "dungeon") =>
				(option.effect as readonly EffectNode[]).reduce((count, effect) => count +
					(effect.kind === "i_discard" && effect.pile === pile ? resolveExpr(effect.count, ctx) : 0), 0);
			const canDiscardItem = availableItems >= discardCount(itemOption, "item");
			const canUseAlternative = deckOf(ctx.state, "dungeonDeck").available.length >= discardCount(alternative, "dungeon");
			if (!canDiscardItem && !canUseAlternative) {
				const penalized = evaluate(unavailableDiscardPenalty, ctx);
				return ctx.withState(penalized).action.log("Sem item ou carta de masmorra para descartar: heróis recebem -1 de dano e -1 de acerto até o fim do combate.");
			}
			if (!canDiscardItem) return evaluate(alternative.effect as readonly EffectNode[], ctx);
			if (!canUseAlternative) return evaluate(itemOption.effect as readonly EffectNode[], ctx);
		}
		const options = node.options.map((opt) => {
			const template = skillOptionLabel(ctx.engine, ctx.skillId, opt.id);
			const label = template.replace(/\{(\w+)\}/g, (_m, k: string) =>
				String((opt.params ?? {})[k] ?? "?"),
			);
			return { id: opt.id, label, params: opt.params, effect: opt.effect };
		});
		return ctx.action.requestChoice(options, {
			allowSkip: node.allow_skip === true,
		});
	},
});

const forEach = effectKind({
	kind: "i_for_each",
	vocabulary: { over: FOR_EACH_OVER },
	schema: z.object({
		kind: z.literal("i_for_each"),
		over: z.enum(FOR_EACH_OVER),
		as: z.string(),
		do: NodeList,
	}),
	children: (node) => node.do as never[],
	evaluate: (node, ctx) => {
		const ids = resolveEntityListRef(node.over, ctx);
		let cur = ctx;
		for (const id of ids) {
			const iterCtx: EvalCtx = {
				...cur,
				targetId: id,
				targetIds: [id],
				withState: cur.withState,
			};
			const next = evaluate(node.do, iterCtx);
			cur = cur.withState(next);
		}
		return cur.state;
	},
});

const noop = effectKind({
	kind: "i_noop",
	aliases: ["noop"],
	schema: z.object({ kind: z.literal("i_noop") }),
	evaluate: (_node, ctx) => ctx.state,
	resolve: (state) => state,
});

const modifyDie = effectKind({
	kind: "i_modify_die",
	vocabulary: { die_side: DIE_SIDES },
	schema: z.object({
		kind: z.literal("i_modify_die"),
		delta: ExprNodeSchema,
		die_side: z.enum(DIE_SIDES),
	}),
	evaluate: (node, ctx) => {
		const delta = resolveExpr(node.delta, ctx);
		return ctx.action.pushEffect({
			kind: "i_modify_die",
			delta,
			die_side: node.die_side,
			hero_id: ctx.sourceId ?? undefined,
			skill_id: ctx.skillId,
		});
	},
	resolve: (state, effect, { pending }) => {
		const delta = effect["delta"] as number;
		const die_side = effect["die_side"] as string;
		const hero_id = effect["hero_id"] as string | undefined;
		const skill_id = (effect["skill_id"] ?? pending.source) as string;
		if (!gameOf(state).combat?.lastRoll) return state;
		return withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				pendingDiceSelection: {
					skillId: skill_id,
					heroId: hero_id ?? gameOf(state).combat!.selectedHeroId ?? "",
					side: die_side as "hero" | "enemy" | "any",
					action: "reroll" as const,
					filter: { minValue: 1 },
					deltaMax: delta,
				},
			} }));
	},
});

const reroll = effectKind({
	kind: "i_reroll",
	vocabulary: { die_side: DIE_SIDES },
	schema: z.object({
		kind: z.literal("i_reroll"),
		die_side: z.enum(DIE_SIDES),
		only_if_value: ExprNodeSchema.optional(),
	}),
	evaluate: (node, ctx) => {
		const only_if_value =
			node.only_if_value !== undefined
				? resolveExpr(node.only_if_value, ctx)
				: undefined;
		return ctx.action.pushEffect({
			kind: "i_reroll",
			die_side: node.die_side,
			hero_id: ctx.sourceId ?? undefined,
			skill_id: ctx.skillId,
			only_if_value,
		});
	},
	resolve: (state, effect, { pending }) => {
		const die_side = effect["die_side"] as string;
		const hero_id = effect["hero_id"] as string | undefined;
		const skill_id = (effect["skill_id"] ?? pending.source) as string;
		const only_if_value = effect["only_if_value"] as number | undefined;
		if (!gameOf(state).combat?.lastRoll) return state;
		const filter =
			only_if_value !== undefined ? { value: only_if_value } : undefined;
		if (only_if_value !== undefined) {
			const heroHasMatch = gameOf(state).combat!.lastRoll!.heroResults.some(
				(v) => v === only_if_value,
			);
			if (!heroHasMatch)
				return log(
					state,
					`Nenhum dado com valor ${only_if_value} para rerolar.`,
				);
		}
		return withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				pendingDiceSelection: {
					skillId: skill_id,
					heroId: hero_id ?? gameOf(state).combat!.selectedHeroId ?? "",
					side: die_side as "hero" | "enemy" | "any",
					action: "reroll" as const,
					...(filter ? { filter } : {}),
				},
			} }));
	},
});

const setDie = effectKind({
	kind: "i_set_die",
	vocabulary: { die_side: DIE_SIDES },
	schema: z.object({
		kind: z.literal("i_set_die"),
		value: ExprNodeSchema,
		die_side: z.enum(DIE_SIDES),
	}),
	evaluate: (node, ctx) => {
		const value = resolveExpr(node.value, ctx);
		return ctx.action.pushEffect({
			kind: "i_set_die",
			value,
			die_side: node.die_side,
			hero_id: ctx.sourceId ?? undefined,
			skill_id: ctx.skillId,
		});
	},
	resolve: (state, effect, { pending }) => {
		const value = effect["value"] as number;
		const die_side = effect["die_side"] as string;
		const hero_id = effect["hero_id"] as string | undefined;
		const skill_id = (effect["skill_id"] ?? pending.source) as string;
		if (!gameOf(state).combat?.lastRoll) return state;
		return withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				pendingDiceSelection: {
					skillId: skill_id,
					heroId: hero_id ?? gameOf(state).combat!.selectedHeroId ?? "",
					side: die_side as "hero" | "enemy" | "any",
					action: "set_to" as const,
					setToValue: value,
				},
			} }));
	},
});

const dispel = effectKind({
	kind: "i_dispel",
	schema: z.object({ kind: z.literal("i_dispel"), category: z.string() }),
	evaluate: (node, ctx) =>
		ctx.action.pushEffect({
			kind: "i_dispel",
			category: node.category,
		}),
	resolve: (state, effect) => {
		const category = effect["category"] as string;
		let next = state;
		for (const unit of [...heroesOf(state), ...enemiesOf(state)]) {
			next = withUnitStats(next, unit.id, {
				conditions: unit.conditions.filter((c) => !c.startsWith(category) && !matchesDamageOverTimeStatus(c, category)),
			});
		}
		return log(next, `Dispel: categoria "${category}" removida.`);
	},
});

const removeStatus = effectKind({
	kind: "i_remove_status",
	schema: z.object({
		kind: z.literal("i_remove_status"),
		status: z.string(),
		to: z.string().optional(),
	}),
	evaluate: (node, ctx) => {
		const to = node.to ? resolveEntityRef(node.to, ctx) : (ctx.targetId ?? ctx.sourceId);
		if (node.to && !to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({
			kind: "i_remove_status",
			status: node.status,
			...(to ? { to } : {}),
		});
	},
	resolve: (state, effect) => {
		const status = effect["status"] as string;
		const targetId = (effect["to"] ?? effect["targetId"]) as string | undefined;
		let next = state;
		if (targetId) {
			const unit =
				heroesOf(next).find((h) => h.id === targetId) ??
				enemiesOf(next).find((e) => e.id === targetId);
			if (unit) {
				next = withUnitStats(next, unit.id, {
					conditions: unit.conditions.filter((c) => !(status === "poison" && c.startsWith("poison:")) && c !== status && !matchesDamageOverTimeStatus(c, status)),
				});
			}
		}
		return log(next, `Status "${status}" removido de ${targetId ?? "todos"}.`);
	},
});

const markTarget = effectKind({
	kind: "i_mark_target",
	aliases: ["mark_target"],
	schema: z.object({
		kind: z.literal("i_mark_target"),
		to: z.string(),
		hero_id: z.string().optional(),
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({
			kind: "i_mark_target",
			to,
			hero_id: ctx.sourceId ?? undefined,
		});
	},
	resolve: (state, effect) => {
		const preyId = targetOf(effect);
		const heroId = effect["hero_id"] as string | undefined;
		if (!preyId || !heroId || !gameOf(state).combat) return state;
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, combat: {
					...gameOf(state).combat!,
					prey: preyId,
					preyByHero: { ...gameOf(state).combat!.preyByHero, [heroId]: preyId },
				} })),
			`${heroId} marcou ${preyId} como Presa.`,
		);
	},
});

const preventNextDamage = effectKind({
	kind: "i_prevent_next_damage",
	aliases: ["prevent_next_damage"],
	schema: z.object({
		kind: z.literal("i_prevent_next_damage"),
		to: z.string(),
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({ kind: "i_prevent_next_damage", to });
	},
	resolve: (state, effect) => {
		const entityId = targetOf(effect);
		if (!entityId) return state;
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, flags: {
					...gameOf(state).flags,
					[`firstDamagePrevented::${entityId}`]: true,
				} })),
			`${entityId}: próximo dano prevenido.`,
		);
	},
});

const ignoreNextTargeting = effectKind({
	kind: "i_ignore_next_targeting",
	aliases: ["ignore_next_targeting"],
	schema: z.object({
		kind: z.literal("i_ignore_next_targeting"),
		to: z.string(),
	}),
	evaluate: (node, ctx) => {
		const to = resolveEntityRef(node.to, ctx);
		if (!to) return unresolvedEntityRef(ctx, node.kind, node.to);
		return ctx.action.pushEffect({ kind: "i_ignore_next_targeting", to });
	},
	resolve: (state, effect) => {
		const heroId = targetOf(effect);
		if (!heroId || !gameOf(state).combat) return state;
		return log(
			withScopedFlag(state, "combat", "targetProtection", heroId),
			`${heroId}: próximo efeito que escolha este herói será ignorado.`,
		);
	},
});

const conditionDefinitions = [
	defineCondition<never, never, EvalCtx>({
		kind: "has_skill",
		schema: z.object({
			kind: z.literal("has_skill"),
			of: z.string(),
			skillId: z.string(),
		}),
		test: (node, ctx) => {
			const entityId = resolveEntityRef(node["of"] as string, ctx);
			if (!entityId) return false;
			return ctx.query.creatureHasSkill(entityId, node["skillId"] as string);
		},
	}),
	defineCondition<never, never, EvalCtx>({
		kind: "compare",
		schema: z.object({
			kind: z.literal("compare"),
			op: z.enum(["lt", "lte", "eq", "gte", "gt", "in"]),
			left: ExprNodeSchema,
			right: ExprNodeSchema,
		}),
		test: (node, ctx) => compareNode(node as never, ctx),
	}),
	defineCondition<never, never, EvalCtx>({
		kind: "and",
		schema: z.object({
			kind: z.literal("and"),
			children: z.array(ConditionLike),
		}),
		children: (node) => (node["children"] as ConditionNode[]).map(asKindNode),
		test: (node, ctx) =>
			(node["children"] as ConditionNode[]).every((c) =>
				resolveCondition(c, ctx),
			),
	}),
	defineCondition<never, never, EvalCtx>({
		kind: "or",
		schema: z.object({
			kind: z.literal("or"),
			children: z.array(ConditionLike),
		}),
		children: (node) => (node["children"] as ConditionNode[]).map(asKindNode),
		test: (node, ctx) =>
			(node["children"] as ConditionNode[]).some((c) =>
				resolveCondition(c, ctx),
			),
	}),
	defineCondition<never, never, EvalCtx>({
		kind: "not",
		schema: z.object({ kind: z.literal("not"), child: ConditionLike }),
		children: (node) => [asKindNode(node["child"] as ConditionNode)],
		test: (node, ctx) => !resolveCondition(node["child"] as ConditionNode, ctx),
	}),
	defineCondition<never, never, EvalCtx>({
		kind: "any_of",
		schema: z.object({
			kind: z.literal("any_of"),
			any_of: z.array(ConditionLike),
		}),
		children: (node) => (node["any_of"] as ConditionNode[]).map(asKindNode),
		test: (node, ctx) =>
			(node["any_of"] as ConditionNode[]).some((c) => resolveCondition(c, ctx)),
	}),
];

function compareNode(
	node: Extract<ConditionNode, { kind: "compare" }>,
	ctx: EvalCtx,
): boolean {
	const left = resolveValue(node.left, ctx);
	const right = resolveValue(node.right, ctx);

	if (node.op === "in") {
		if (Array.isArray(right)) return right.includes(left);
		return left === right;
	}

	const l = left as number | string;
	const r = right as number | string;
	switch (node.op) {
		case "lt":
			return l < r;
		case "lte":
			return l <= r;
		case "eq":
			return l === r;
		case "gte":
			return l >= r;
		case "gt":
			return l > r;
	}
	return false;
}

const builtinRefs: RefResolver<EvalCtx>[] = [
	{
		id: "builtin.modifier_stat",
		space: "modifier_stat",
		resolve: (stat) => BUILTIN_MODIFIER_STATS[stat],
	},
	{
		id: "builtin.damage_type",
		space: "damage_type",
		resolve: (type) => (BUILTIN_DAMAGE_TYPES.includes(type) ? type : undefined),
	},
	{
		id: "builtin.number.params",
		space: "number",
		priority: -10,
		resolve: (ref, ctx) => {
			const name = ref.slice(1);
			if (!(name in ctx.params)) return undefined;
			const v = ctx.params[name];
			if (typeof v === "number") return v;
			const n = Number(v);
			if (!Number.isNaN(n)) return n;
			throw new Error(
				`[resolveExpr] param "${name}" não é número: ${String(v)}`,
			);
		},
	},
	{
		id: "builtin.entity.context",
		space: "entity",
		resolve: (ref, ctx) => {
			switch (ref) {
				case "$source":
				case "$self":
					return ctx.sourceId;
				case "$target":
					return ctx.targetId;
			}
			return undefined;
		},
	},
	{
		id: "builtin.entity.params",
		space: "entity",
		priority: 10,
		resolve: (ref, ctx) => {
			const name = ref.slice(1);
			if (!(name in ctx.params)) return undefined;
			const v = ctx.params[name];
			return typeof v === "string" ? v : null;
		},
	},
	{
		id: "builtin.entities.context",
		space: "entities",
		resolve: (ref, ctx) => {
			switch (ref) {
				case "$targets":
					return ctx.targetIds;
				case "$source":
					return ctx.sourceId ? [ctx.sourceId] : [];
				case "$target":
					return ctx.targetId ? [ctx.targetId] : [];
			}
			return undefined;
		},
	},
];

export const builtinPackage: GameKindPackage = {
	id: "builtin",
	kinds: [
		damage,
		heal,
		fullHeal,
		preventDestroy,
		modifier,
		trigger,
		ifKind,
		chooseOne,
		forEach,
		noop,
		modifyDie,
		reroll,
		setDie,
		dispel,
		removeStatus,
		markTarget,
		preventNextDamage,
		ignoreNextTargeting,
		...(conditionDefinitions as unknown as GameKind[]),
	],
	refs: builtinRefs,
};

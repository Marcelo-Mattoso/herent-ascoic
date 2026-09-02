// Schemas Zod para validação de `skills.json` pós-patch-12.
// Importado pelo loader de skills e pelo CI de guard rails (Fase 8).

import { z } from "zod";

// ── Expressões ───────────────────────────────────────────────────────────────

const ArithExprSchema: z.ZodType<unknown> = z.lazy(() =>
	z.object({
		op: z.enum(["add", "sub", "mul", "div", "min", "max"]),
		args: z.tuple([ExprNodeSchema, ExprNodeSchema]),
	}),
);

const ColorByAwakeningSchema = z.tuple([
	z.number().nullable(),
	z.number().nullable(),
	z.number().nullable(),
	z.number().nullable(),
	z.number().nullable(),
]);

const ExprNodeSchema: z.ZodType<unknown> = z.union([
	z.number(),
	z.string(),
	ArithExprSchema,
	ColorByAwakeningSchema,
]);

// ── Condições ────────────────────────────────────────────────────────────────

const ConditionNodeSchema: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		z.discriminatedUnion("kind", [
			z.object({
				kind: z.literal("has_skill"),
				of: z.string(),
				skillId: z.string(),
			}),
			z.object({
				kind: z.literal("has_condition"),
				of: z.string(),
				conditionType: z.string(),
			}),
			z.object({
				kind: z.literal("compare"),
				op: z.enum(["lt", "lte", "eq", "gte", "gt", "in"]),
				left: ExprNodeSchema,
				right: ExprNodeSchema,
			}),
			z.object({
				kind: z.literal("and"),
				children: z.array(ConditionNodeSchema),
			}),
			z.object({
				kind: z.literal("or"),
				children: z.array(ConditionNodeSchema),
			}),
			z.object({ kind: z.literal("not"), child: ConditionNodeSchema }),
		]),
		// any_of — atalho OR sem kind discriminator
		z.object({ any_of: z.array(ConditionNodeSchema) }),
	]),
);

// ── Durações ─────────────────────────────────────────────────────────────────

const DurationNodeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("once") }),
	z.object({ kind: z.literal("until_end_of_round") }),
	z.object({ kind: z.literal("until_end_of_combat") }),
	z.object({ kind: z.literal("while_in_play") }),
	z.object({ kind: z.literal("permanent") }),
	z.object({ kind: z.literal("passive") }),
	z.object({ kind: z.literal("once_per_round") }),
]);

// ── Effects ──────────────────────────────────────────────────────────────────

// Stat closed enum for p_modifier
const ModifierStatSchema = z.enum([
	"s_damage_reduction",
	"s_purple_damage_reduction",
	"s_hit_bonus",
	"s_hit_penalty",
	"s_damage_dealt",
	"s_damage_penalty",
	"s_heal_blocked",
	"s_flee_blocked",
	"s_dungeon_discard_prevention",
	"s_dungeon_discard_locked",
	"s_first_damage_prevented",
]);

const EffectNodeSchema: z.ZodType<unknown> = z.lazy(() =>
	z.discriminatedUnion("kind", [
		// Dano / cura (i_*)
		z.object({
			kind: z.literal("i_damage"),
			to: z.string(),
			amount: ExprNodeSchema,
			minimum: z.number().optional(),
		}),
		z.object({
			kind: z.literal("i_heal"),
			to: z.string(),
			amount: ExprNodeSchema,
		}),
		z.object({ kind: z.literal("i_full_heal"), to: z.string() }),
		z.object({ kind: z.literal("i_prevent_destroy"), to: z.string() }),
		// Modificadores (p_*)
		z.object({
			kind: z.literal("p_modifier"),
			to: z.string(),
			stat: ModifierStatSchema,
			operation: z.enum(["add", "multiply", "set"]),
			value: ExprNodeSchema,
			duration: DurationNodeSchema,
			condition: ConditionNodeSchema.optional(),
			sourceEntityId: z.string().optional(),
		}),
		z.object({
			kind: z.literal("add_trigger"),
			to: z.string(),
			on: z.string(),
			effect: z.array(EffectNodeSchema),
			duration: DurationNodeSchema,
			condition: ConditionNodeSchema.optional(),
			priority: z.number().optional(),
		}),
		z.object({
			kind: z.literal("p_block"),
			what: z.enum([
				"flee",
				"heal",
				"dungeon_discard",
				"power_use",
				"dungeon_level_reduction",
			]),
			duration: DurationNodeSchema.optional(),
			sourceEntityId: z.string().optional(),
		}),
		// Decks (i_*)
		z.object({
			kind: z.literal("i_discard"),
			pile: z.enum(["dungeon", "item"]),
			count: ExprNodeSchema,
			who: z.string().optional(),
		}),
		z.object({
			kind: z.literal("i_draw"),
			pile: z.enum(["dungeon", "item_deck", "artifact_deck"]),
			count: ExprNodeSchema,
		}),
		// Dungeon (i_*)
		z.object({
			kind: z.literal("i_advance_dungeon"),
			amount: ExprNodeSchema,
		}),
		// Misc (i_*)
		z.object({ kind: z.literal("i_set_no_reward"), to: z.string() }),
		z.object({ kind: z.literal("i_prevent_next_damage"), to: z.string() }),
		z.object({ kind: z.literal("i_ignore_next_targeting"), to: z.string() }),
		z.object({ kind: z.literal("i_recover_dungeon"), count: ExprNodeSchema }),
		z.object({ kind: z.literal("i_mark_target"), to: z.string() }),
		z.object({ kind: z.literal("i_prevent_dungeon_discard") }),
		z.object({
			kind: z.literal("i_draw_and_choose"),
			pile: z.enum(["dungeon", "item_deck", "artifact_deck"]),
			reveal: ExprNodeSchema,
			keep: ExprNodeSchema,
		}),
		z.object({ kind: z.literal("i_reveal_dungeon"), count: ExprNodeSchema }),
		z.object({
			kind: z.literal("i_grant_reward"),
			rewardType: z.enum(["item", "artifact"]),
			cardId: z.string(),
		}),
		// Composição (i_*)
		z.object({
			kind: z.literal("i_if"),
			when: ConditionNodeSchema,
			then: z.array(EffectNodeSchema),
			else: z.array(EffectNodeSchema).optional(),
		}),
		z.object({
			kind: z.literal("i_choose_one"),
			options: z
				.array(
					z.object({
						id: z.string().regex(/^[a-z_][a-z0-9_]*$/),
						params: z
							.record(z.string(), z.union([z.number(), z.string()]))
							.optional(),
						effect: z.array(EffectNodeSchema),
					}),
				)
				.min(2),
		}),
		z.object({
			kind: z.literal("i_for_each"),
			over: z.enum(["targets", "allies", "enemies", "all_heroes", "$each"]),
			as: z.string(),
			do: z.array(EffectNodeSchema),
		}),
		z.object({ kind: z.literal("i_noop") }),
		// Dado (Lote F)
		z.object({
			kind: z.literal("i_modify_die"),
			delta: ExprNodeSchema,
			die_side: z.enum(["hero", "enemy", "any"]),
		}),
		z.object({
			kind: z.literal("i_reroll"),
			die_side: z.enum(["hero", "enemy", "any"]),
			only_if_value: ExprNodeSchema.optional(),
		}),
		z.object({
			kind: z.literal("i_set_die"),
			value: ExprNodeSchema,
			die_side: z.enum(["hero", "enemy", "any"]),
		}),
		// Status (Lote F)
		z.object({ kind: z.literal("i_dispel"), category: z.string() }),
		z.object({ kind: z.literal("i_remove_status"), status: z.string() }),
	]),
);

// ── Nature (patch-21 Lote D) ─────────────────────────────────────────────────

const NatureSchema = z.enum([
	"nat_physical",
	"nat_magical",
	"nat_fire",
	"nat_water",
	"nat_earth",
	"nat_wind",
	"nat_holy",
	"nat_dark",
	"nat_bleed",
	"nat_poison",
	"nat_shock",
	"nat_paralyze",
	"nat_sleep",
	"nat_hold",
	"nat_derangement",
	"nat_death",
	"nat_true",
]);

// ── Trigger v2 (patch-21 Lote B) ─────────────────────────────────────────────

const OperateTypeSchema = z.enum([
	"op_active",
	"op_active_buff",
	"op_triggered",
	"op_passive",
]);

const EventNameSchema = z.enum([
	"evt_attack_declared",
	"evt_roll",
	"evt_hit",
	"evt_damage_dealt",
	"evt_damage_taken",
	"evt_destroy",
	"evt_kill",
	"evt_combat_start",
	"evt_combat_end",
	"evt_round_start",
	"evt_round_end",
	"evt_room_reveal",
	"evt_room_enter",
	"evt_room_leave",
	"evt_dungeon_discard",
	"evt_enter_play",
	"evt_leave_play",
	"evt_targeted",
]);

const TriggerWindowSchema = z.enum([
	"room_enter",
	"paths_open",
	"before_combat",
	"round_start",
	"hero_action",
	"before_attack_roll",
	"after_roll_before_result",
	"before_damage",
	"after_damage",
	"on_destroy",
	"combat_end",
	"room_leave",
	"dungeon_discard",
	"round_end",
	"entity_enter_play",
	"hero_leave_play",
	"targeted",
]);

const TriggerV2Schema = z.object({
	event: EventNameSchema,
	window: TriggerWindowSchema.optional(),
});

const InterruptSchema = z
	.object({
		mode: z.enum(["auto", "prompt", "passive"]).optional(),
		priority: z.number().optional(),
		prompt: z.string().optional(),
	})
	.optional();

const CooldownSchema = z
	.object({
		scope: z.enum(["game", "room", "combat", "round"]),
		charges: z.number().int().positive(),
	})
	.optional();

// ── Trigger legado (mantido para schema-guard.test.ts) ─────────────────────

const LimitKindSchema = z.enum([
	"once_per_game",
	"once_per_combat",
	"once_per_room",
	"once_per_round",
]);

export const TriggerObjectSchema = z.object({
	on: z.string().min(1),
	when: ConditionNodeSchema.optional(),
	limit: LimitKindSchema.optional(),
});

/** Rejeita trigger no formato string legado. */
export const TriggerFieldSchema = z.union([
	TriggerObjectSchema,
	z.string().transform((_val, ctx) => {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `trigger deve ser objeto — formato string legado rejeitado. Recebido: "${_val}"`,
		});
		return z.NEVER;
	}),
]);

// ── SkillDefinition v2 (patch-21 Lote B) ─────────────────────────────────────

const CostSchema = z
	.object({
		hp: z.number().optional(),
		mp: z.number().optional(),
		discard: z.number().optional(),
	})
	.optional();

export const SkillDefinitionV2Schema = z
	.object({
		id: z.string().min(1),
		category: z.enum([
			"hero_skill",
			"hero_power",
			"monster_purple",
			"item_skill",
			"dungeon_skill",
			"boss_skill",
		]),
		nature: z.array(NatureSchema).optional(),
		operate_type: OperateTypeSchema,
		trigger: TriggerV2Schema.optional(),
		interrupt: InterruptSchema,
		conditions: z.array(ConditionNodeSchema).optional(),
		cooldown: CooldownSchema,
		// Targeting v2 (Lote C)
		target_type: z.enum([
			"tgt_self",
			"tgt_target",
			"tgt_enemy",
			"tgt_item",
			"tgt_others",
			"tgt_none",
		]),
		affect_scope: z.enum([
			"scp_single",
			"scp_party_full",
			"scp_dead_party",
			"scp_room",
			"scp_none",
		]),
		affect_object: z.enum(["obj_friend", "obj_not_friend", "obj_all"]),
		affect_limit: z.object({ min: z.number(), max: z.number() }).optional(),
		params: z.record(z.string(), z.unknown()).optional(),
		cost: CostSchema,
		effect: z.array(EffectNodeSchema).optional(),
		script: z.string().optional(),
	})
	.refine((d) => (d.effect !== undefined) !== (d.script !== undefined), {
		message:
			"Cada entrada deve ter exatamente um de `effect` ou `script` — nunca ambos, nunca nenhum.",
	})
	.refine((d) => d.operate_type !== "op_triggered" || d.trigger !== undefined, {
		message: "op_triggered requer trigger.event",
	});

export type SkillDefinitionV2 = z.infer<typeof SkillDefinitionV2Schema>;

// ── Exports dos schemas atômicos (para testes unitários) ─────────────────────

export {
	ConditionNodeSchema,
	DurationNodeSchema,
	EffectNodeSchema,
	EventNameSchema,
	ExprNodeSchema,
	OperateTypeSchema,
};

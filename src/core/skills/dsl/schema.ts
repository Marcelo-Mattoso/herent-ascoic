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

// A forma de cada condição é validada pelo kind registrado na engine
// (`engine.kinds.validate`); aqui só o envelope.
const ConditionNodeSchema: z.ZodType<unknown> = z.union([
	z.looseObject({ kind: z.string().min(1) }),
	z.looseObject({ any_of: z.array(z.unknown()) }),
]);

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

// O schema de cada kind mora no próprio kind registrado; o carregamento do
// conteúdo valida recursivamente por `engine.kinds.validate`.
const EffectNodeSchema: z.ZodType<unknown> = z.looseObject({
	kind: z.string().min(1),
});

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
	"evt_would_be_destroyed",
	"evt_destroy",
	"evt_kill",
	"evt_combat_start",
	"evt_combat_end",
	"evt_round_start",
	"evt_round_end",
	"evt_room_reveal",
	"evt_room_enter",
	"evt_room_won",
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
	"before_destroy",
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
		action_cost: z.enum(["none", "consume_hero_action"]).optional(),
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
		rules: z
			.object({
				handledByEquipment: z.boolean().optional(),
				hitBonusParam: z.string().optional(),
				preyHitBonus: z.object({ label: z.string() }).strict().optional(),
				minRollMargin: z.number().optional(),
				lifeDrain: z.number().optional(),
				damageType: z.string().min(1).optional(),
			})
			.strict()
			.optional(),
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

// ── Ability + AbilityGrant vNext ────────────────────────────────────────────
// A ability contém exclusivamente o efeito. As regras de ativação pertencem ao
// grant que a fonte (hero/item/sala/etc.) declara.

const AbilityParameterSchema = z
	.object({
		type: z.enum(["integer", "number", "string", "boolean"]),
		minimum: z.number().optional(),
		maximum: z.number().optional(),
		required: z.boolean().optional(),
	})
	.strict();

export const AbilityDefinitionSchema = z
	.object({
		id: z.string().min(1),
		nature: z.array(NatureSchema).optional(),
		parameters: z.record(z.string(), AbilityParameterSchema).optional(),
		defaultParams: z.record(z.string(), z.unknown()).optional(),
		targetContract: z.object({ required: z.boolean().optional() }).strict().optional(),
		effect: z.array(EffectNodeSchema).optional(),
		script: z.string().min(1).optional(),
	})
	.strict()
	.refine((d) => (d.effect !== undefined) !== (d.script !== undefined), {
		message:
			"Cada ability deve ter exatamente um de `effect` ou `script` — sem metadados de ativação.",
	});

const AbilityTargetingSchema = z
	.object({
		targetType: z.enum([
			"tgt_self",
			"tgt_target",
			"tgt_enemy",
			"tgt_item",
			"tgt_others",
			"tgt_none",
		]),
		affectScope: z.enum([
			"scp_single",
			"scp_party_full",
			"scp_dead_party",
			"scp_room",
			"scp_none",
		]),
		affectObject: z.enum(["obj_friend", "obj_not_friend", "obj_all"]),
		affectLimit: z.object({ min: z.number(), max: z.number() }).optional(),
	})
	.strict();

const AbilityActivationSchema = z
	.object({
		kind: z.enum(["manual", "event", "continuous", "on_enter_play"]),
		event: EventNameSchema.optional(),
		window: TriggerWindowSchema.optional(),
		decision: z.enum(["automatic", "optional", "required"]).optional(),
		priority: z.number().optional(),
		conditions: z.array(ConditionNodeSchema).optional(),
		limit: z
			.object({
				scope: z.enum(["game", "room", "combat", "round"]),
				maxUses: z.number().int().positive(),
			})
			.strict()
			.optional(),
		cost: z
			.object({ hp: z.number().optional(), mp: z.number().optional() })
			.strict()
			.optional(),
		actionCost: z.enum(["none", "consume_hero_action"]).optional(),
		usableFromReward: z.boolean().optional(),
		consumeSource: z.enum(["none", "discard", "remove"]).optional(),
		targeting: AbilityTargetingSchema.optional(),
	})
	.strict()
	.superRefine((activation, ctx) => {
		if (activation.kind === "event" && !activation.event) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["event"],
				message: "activation.kind = event requer event.",
			});
		}
		if (activation.kind !== "event" && activation.event) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["event"],
				message: "event só pode ser declarado quando activation.kind = event.",
			});
		}
	});

export const AbilityGrantSchema = z
	.object({
		id: z.string().min(1),
		abilityId: z.string().min(1),
		params: z.record(z.string(), z.unknown()).optional(),
		requiresAwakening: z.boolean().optional(),
		activation: AbilityActivationSchema,
	})
	.strict();

export const AbilityCatalogSchema = z
	.object({
		version: z.string().min(1),
		abilities: z.array(AbilityDefinitionSchema),
	})
	.strict()
	.superRefine((catalog, ctx) => {
		const seen = new Set<string>();
		for (const [index, ability] of catalog.abilities.entries()) {
			if (seen.has(ability.id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["abilities", index, "id"],
					message: `Ability id duplicado: ${ability.id}.`,
				});
			}
			seen.add(ability.id);
		}
	});

// ── Exports dos schemas atômicos (para testes unitários) ─────────────────────

export {
	ConditionNodeSchema,
	AbilityActivationSchema,
	AbilityParameterSchema,
	DurationNodeSchema,
	EffectNodeSchema,
	EventNameSchema,
	ExprNodeSchema,
	OperateTypeSchema,
};

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

const ExprNodeSchema: z.ZodType<unknown> = z.union([
	z.number(),
	z.string(),
	ArithExprSchema,
]);

// ── Condições ────────────────────────────────────────────────────────────────

const ConditionNodeSchema: z.ZodType<unknown> = z.lazy(() =>
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
		z.object({ kind: z.literal("or"), children: z.array(ConditionNodeSchema) }),
		z.object({ kind: z.literal("not"), child: ConditionNodeSchema }),
	]),
);

// ── Durações ─────────────────────────────────────────────────────────────────

const DurationNodeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("once") }),
	z.object({ kind: z.literal("until_end_of_round") }),
	z.object({ kind: z.literal("until_end_of_combat") }),
	z.object({ kind: z.literal("while_in_play") }),
	z.object({ kind: z.literal("passive") }),
	z.object({ kind: z.literal("once_per_round") }),
]);

// ── Effects ──────────────────────────────────────────────────────────────────

const EffectNodeSchema: z.ZodType<unknown> = z.lazy(() =>
	z.discriminatedUnion("kind", [
		// Dano / cura
		z.object({
			kind: z.literal("apply_damage"),
			to: z.string(),
			amount: ExprNodeSchema,
			minimum: z.number().optional(),
		}),
		z.object({
			kind: z.literal("apply_heal"),
			to: z.string(),
			amount: ExprNodeSchema,
		}),
		z.object({ kind: z.literal("apply_full_heal"), to: z.string() }),
		z.object({ kind: z.literal("prevent_destroy"), to: z.string() }),
		// Modificadores
		z.object({
			kind: z.literal("add_modifier"),
			to: z.string(),
			stat: z.string(),
			operation: z.enum(["add", "multiply", "set"]),
			value: ExprNodeSchema,
			duration: DurationNodeSchema,
			condition: ConditionNodeSchema.optional(),
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
			kind: z.literal("block_action"),
			what: z.enum([
				"flee",
				"heal",
				"dungeon_discard",
				"power_use",
				"dungeon_level_reduction",
			]),
		}),
		// Decks
		z.object({
			kind: z.literal("discard_from"),
			pile: z.enum(["dungeon", "item"]),
			count: ExprNodeSchema,
			who: z.string().optional(),
		}),
		z.object({
			kind: z.literal("draw_from"),
			pile: z.enum(["dungeon", "item_deck", "artifact_deck"]),
			count: ExprNodeSchema,
		}),
		// Dungeon
		z.object({
			kind: z.literal("advance_dungeon_level"),
			amount: ExprNodeSchema,
		}),
		// Misc
		z.object({ kind: z.literal("set_no_reward"), to: z.string() }),
		// Composição
		z.object({
			kind: z.literal("if"),
			when: ConditionNodeSchema,
			then: z.array(EffectNodeSchema),
			else: z.array(EffectNodeSchema).optional(),
		}),
		z.object({
			kind: z.literal("choose_one"),
			options: z
				.array(
					z.object({ label: z.string(), effect: z.array(EffectNodeSchema) }),
				)
				.min(2),
		}),
		z.object({
			kind: z.literal("for_each"),
			over: z.enum(["targets", "allies", "enemies", "all_heroes"]),
			as: z.string(),
			do: z.array(EffectNodeSchema),
		}),
		z.object({ kind: z.literal("noop") }),
	]),
);

// ── Trigger (objeto) ──────────────────────────────────────────────────────────

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
			message: `trigger deve ser objeto {on, when?, limit?} — formato string legado rejeitado. Recebido: "${_val}"`,
		});
		return z.NEVER;
	}),
]);

// ── SkillDefinition (pós-patch-12) ───────────────────────────────────────────

/**
 * Entrada válida de `skills.json` pós-patch-12.
 * Regra: exatamente um de `effect` ou `script` deve estar presente.
 */
export const SkillDefinitionV2Schema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		category: z.enum([
			"habilidade",
			"poder_heroi",
			"efeito_roxo_monstro",
			"habilidade_item",
			"habilidade_dungeon",
			"habilidade_chefe",
		]),
		trigger: TriggerObjectSchema,
		target: z.string(),
		params: z.record(z.string(), z.unknown()).optional(),
		effect: z.array(EffectNodeSchema).optional(),
		script: z.string().optional(),
	})
	.refine((d) => (d.effect !== undefined) !== (d.script !== undefined), {
		message:
			"Cada entrada deve ter exatamente um de `effect` ou `script` — nunca ambos, nunca nenhum.",
	})
	.refine((d) => !("type" in d), {
		message: "Campo `type` removido — use `effect` ou `script`.",
	});

export type SkillDefinitionV2 = z.infer<typeof SkillDefinitionV2Schema>;

// ── Exports dos schemas atômicos (para testes unitários) ─────────────────────

export {
	ConditionNodeSchema,
	DurationNodeSchema,
	EffectNodeSchema,
	ExprNodeSchema,
};

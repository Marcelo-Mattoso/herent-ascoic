// Guard rail — Fase 8 (Patch-12), atualizado em Patch-21 Lote B.
// Valida entradas migradas de skills.yaml contra o schema Zod v2.

import { describe, expect, it } from "vitest";
import { SkillDefinitionV2Schema, TriggerFieldSchema } from "../schema";

// ── TriggerFieldSchema (legado) — mantido para verificar que o antigo formato rejeitado ─

describe("TriggerFieldSchema — rejeita string legada", () => {
	it("rejeita trigger como string simples", () => {
		const result = TriggerFieldSchema.safeParse("before_attack");
		expect(result.success).toBe(false);
	});

	it("rejeita trigger como string composta", () => {
		const result = TriggerFieldSchema.safeParse(
			"combat_if_dungeon_red_or_purple",
		);
		expect(result.success).toBe(false);
	});

	it("aceita trigger como objeto mínimo {on}", () => {
		expect(TriggerFieldSchema.safeParse({ on: "before_attack" }).success).toBe(
			true,
		);
	});

	it("aceita trigger com when e limit", () => {
		expect(
			TriggerFieldSchema.safeParse({
				on: "combat",
				when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
				limit: "once_per_game",
			}).success,
		).toBe(true);
	});
});

// ── SkillDefinitionV2Schema — valida entradas pós-migração ────────────────────

const targetingV2 = {
	target_type: "tgt_self",
	affect_scope: "scp_single",
	affect_object: "obj_friend",
};

// Base válida para op_active (sem trigger, sem cooldown)
const validBaseActive = {
	id: "test_skill",
	category: "habilidade",
	operate_type: "op_active",
	...targetingV2,
};

// Base válida para op_triggered
const validBaseTriggered = {
	id: "test_skill",
	category: "habilidade",
	operate_type: "op_triggered",
	trigger: { event: "evt_roll" },
	...targetingV2,
};

describe("SkillDefinitionV2Schema — effect XOR script", () => {
	it("aceita op_active só com effect", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita op_active só com script", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				script: "test_script",
			}).success,
		).toBe(true);
	});

	it("aceita op_triggered com trigger.event", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseTriggered,
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("rejeita op_triggered sem trigger", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				operate_type: "op_triggered",
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(false);
	});

	it("rejeita entrada com ambos effect e script", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				effect: [{ kind: "i_noop" }],
				script: "test_script",
			}).success,
		).toBe(false);
	});

	it("rejeita entrada sem effect nem script", () => {
		expect(SkillDefinitionV2Schema.safeParse(validBaseActive).success).toBe(false);
	});

	it("aceita op_active_buff", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				operate_type: "op_active_buff",
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita op_passive", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseActive,
				operate_type: "op_passive",
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita cooldown estruturado", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseTriggered,
				cooldown: { scope: "room", charges: 1 },
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita conditions[]", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseTriggered,
				conditions: [{ kind: "compare", op: "gte", left: "$dungeon.level", right: 3 }],
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita any_of em conditions", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBaseTriggered,
				conditions: [
					{ any_of: [
						{ kind: "compare", op: "eq", left: "$dungeon.level", right: 3 },
						{ kind: "compare", op: "eq", left: "$dungeon.level", right: 4 },
					]},
				],
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(true);
	});
});

// ── Todas as entradas de skills.yaml passam no schema v2 ──────────────────────

import { SKILLS as skillsData } from "../../../data/skills";

describe("skills.yaml — todas as entradas passam no schema v2", () => {
	const skills = skillsData.abilities as any[];
	const migrated = skills.filter((s: any) => s.effect || s.script);

	it(`${migrated.length} entradas migradas encontradas`, () => {
		expect(migrated.length).toBeGreaterThan(50);
	});

	for (const skill of migrated) {
		it(`${skill.id} — válida contra SkillDefinitionV2Schema`, () => {
			const result = SkillDefinitionV2Schema.safeParse(skill);
			if (!result.success) {
				console.error(`${skill.id}:`, result.error.issues);
			}
			expect(result.success).toBe(true);
		});
	}
});


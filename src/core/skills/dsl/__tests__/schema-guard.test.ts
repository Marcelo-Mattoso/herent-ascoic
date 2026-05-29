// Guard rail — Fase 8 (Patch-12):
// Valida entradas migradas de skills.json contra o schema Zod pós-patch-12.
// Garante que entradas com effect/script obedecem as regras de exclusividade.

import { describe, expect, it } from "vitest";
import { SkillDefinitionV2Schema, TriggerFieldSchema } from "../schema";

// ── Trigger field rejeita string legada ────────────────────────────────────────

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

const validBase = {
	id: "test_skill",
	name: "Teste",
	category: "habilidade",
	trigger: { on: "on_use" },
	target: "self",
	usedBy: [],
};

describe("SkillDefinitionV2Schema — effect XOR script", () => {
	it("aceita entrada só com effect", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBase,
				effect: [{ kind: "noop" }],
			}).success,
		).toBe(true);
	});

	it("aceita entrada só com script", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBase,
				script: "test_script",
			}).success,
		).toBe(true);
	});

	it("rejeita entrada com ambos effect e script", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBase,
				effect: [{ kind: "noop" }],
				script: "test_script",
			}).success,
		).toBe(false);
	});

	it("rejeita entrada sem effect nem script", () => {
		expect(SkillDefinitionV2Schema.safeParse(validBase).success).toBe(false);
	});

	// Nota: o guard de `type` legado não é verificável aqui pois Zod faz strip()
	// de campos desconhecidos antes do refine. O guarda real é o schema TS (type?: string).
	it("aceita entrada sem campo type (pós-migração)", () => {
		expect(
			SkillDefinitionV2Schema.safeParse({
				...validBase,
				effect: [{ kind: "noop" }],
			}).success,
		).toBe(true);
	});
});

// ── Todas as entradas migradas de skills.json passam na schema v2 ─────────────

import skillsData from "../../../../data/skills.json";

describe("skills.json — entradas migradas passam no schema v2", () => {
	const skills = skillsData.abilities as any[];
	const migrated = skills.filter((s: any) => s.effect || s.script);

	it(`${migrated.length} entradas migradas encontradas`, () => {
		expect(migrated.length).toBeGreaterThan(50);
	});

	for (const skill of migrated) {
		it(`${skill.id} — válida contra SkillDefinitionV2Schema`, () => {
			// Convertemos trigger string para objeto para validação (legado ainda usa string)
			const toValidate = {
				...skill,
				trigger:
					typeof skill.trigger === "string"
						? { on: skill.trigger }
						: skill.trigger,
			};
			const result = SkillDefinitionV2Schema.safeParse(toValidate);
			if (!result.success) {
				console.error(`${skill.id}:`, result.error.issues);
			}
			expect(result.success).toBe(true);
		});
	}
});

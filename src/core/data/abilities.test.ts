import { describe, expect, it } from "vitest";
import {
	AbilityCatalogSchema,
	AbilityDefinitionSchema,
	AbilityGrantSchema,
} from "../skills/dsl/schema";
import { ABILITIES, cardAbilityGrants, lookupAbilityById } from "./abilities";
import { getAllCards } from "./cards";
import { SKILLS } from "./skills";

describe("Ability + AbilityGrant — camada de compatibilidade", () => {
	it("normaliza todo o catálogo legado como abilities reutilizáveis", () => {
		expect(ABILITIES.abilities.length).toBeGreaterThanOrEqual(
			SKILLS.abilities.length,
		);
		const heal = lookupAbilityById("skill_last_light_healing");
		expect(heal).toMatchObject({
			id: "skill_last_light_healing",
			effect: [{ kind: "i_heal" }],
		});
		expect(heal).not.toHaveProperty("trigger");
		expect(heal).not.toHaveProperty("category");
	});

	it("expõe uma SkillRef legada como grant da fonte, preservando ciclo de vida", () => {
		const grants = cardAbilityGrants("item_lesser_vigor_potion");
		expect(grants).toHaveLength(1);
		expect(grants[0]).toMatchObject({
			abilityId: "skill_last_light_healing",
			params: { value: 2 },
			activation: {
				kind: "manual",
				actionCost: "none",
				consumeSource: "discard",
			},
		});
	});

	it("migra via adaptador cada fonte não-item para AbilityGrant", () => {
		const migratedTypes = new Set([
			"hero",
			"creature",
			"subboss",
			"room",
			"subboss_room",
			"artifact",
			"boss",
		]);
		const sources = getAllCards().filter((card) => migratedTypes.has(card.type));

		expect(sources).not.toHaveLength(0);
		for (const card of sources) {
			const grants = cardAbilityGrants(card.id);
			expect(grants, `${card.id} precisa produzir um grant por SkillRef`).toHaveLength(
				card.skills.length,
			);
			expect(grants.map((grant) => grant.abilityId)).toEqual(
				card.skills.map((ref) => ref.skillId),
			);
		}
	});

	it("valida o contrato global: grants existentes e abilities puras", () => {
		for (const card of getAllCards()) {
			for (const grant of cardAbilityGrants(card.id)) {
				expect(
					lookupAbilityById(grant.abilityId),
					`${card.id}/${grant.id} aponta para ability ausente`,
				).not.toBeNull();
				expect(
					AbilityGrantSchema.safeParse(grant).success,
					`${card.id}/${grant.id} viola o schema de concessão`,
				).toBe(true);
			}
		}

		for (const ability of ABILITIES.abilities) {
			expect(
				Boolean(ability.effect) !== Boolean(ability.script),
				`${ability.id} deve declarar DSL ou script, nunca ambos`,
			).toBe(true);
			expect(ability).not.toHaveProperty("cost");
			expect(ability).not.toHaveProperty("limit");
			expect(ability).not.toHaveProperty("cooldown");
		}
	});


	it("valida uma ability pura e rejeita metadados de ativação nela", () => {
		expect(
			AbilityDefinitionSchema.safeParse({
				id: "ability_restore_life",
				parameters: { amount: { type: "integer", minimum: 1 } },
				effect: [{ kind: "i_heal", to: "$target", amount: "$amount" }],
			}).success,
		).toBe(true);

		expect(
			AbilityDefinitionSchema.safeParse({
				id: "ability_invalid",
				operate_type: "op_active",
				effect: [{ kind: "i_noop" }],
			}).success,
		).toBe(false);
	});

	it("exige evento para grants reativos e permite limite próprio da fonte", () => {
		expect(
			AbilityGrantSchema.safeParse({
				id: "warm_blood_damage_response",
				abilityId: "ability_reduce_damage",
				activation: {
					kind: "event",
					event: "evt_damage_taken",
					decision: "optional",
					limit: { scope: "combat", maxUses: 1 },
					actionCost: "none",
				},
			}).success,
		).toBe(true);
		expect(
			AbilityGrantSchema.safeParse({
				id: "invalid_reaction",
				abilityId: "ability_reduce_damage",
				activation: { kind: "event" },
			}).success,
		).toBe(false);
	});

	it("rejeita ids duplicados no catálogo novo", () => {
		expect(
			AbilityCatalogSchema.safeParse({
				version: "1",
				abilities: [
					{ id: "duplicate", effect: [{ kind: "i_noop" }] },
					{ id: "duplicate", effect: [{ kind: "i_noop" }] },
				],
			}).success,
		).toBe(false);
	});
});

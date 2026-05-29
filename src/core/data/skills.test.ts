import { describe, expect, it } from "vitest";
import { getAllCards } from "./cards";
import { SKILLS } from "./skills";
import { cardSkills, skillUsedBy } from "../skills/lookup";

describe("catálogo de skills (skills.json)", () => {
	it("carrega sem erros e tem versão definida", () => {
		expect(SKILLS.version).toBeDefined();
		expect(SKILLS.abilities).toBeInstanceOf(Array);
		expect(SKILLS.abilities.length).toBeGreaterThan(0);
	});

	it("todos os ids são únicos", () => {
		const ids = SKILLS.abilities.map((a) => a.id);
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});

	it("cada ability tem campos obrigatórios", () => {
		for (const ability of SKILLS.abilities) {
			expect(typeof ability.id).toBe("string");
			expect(typeof ability.name).toBe("string");
			// `type` é opcional em entradas migradas para DSL/script (patch-12)
			if (!ability.effect && !ability.script) {
				expect(typeof ability.type).toBe("string");
			}
			expect(typeof ability.trigger).toBe("string");
			expect(typeof ability.target).toBe("string");
			// usedBy foi removido (patch-13) — derivado de cards.json via skillUsedBy()
		}
	});

	it("integridade referencial: todos os skillIds em cards.json existem em skills.json", () => {
		const allCards = getAllCards();
		const skillIds = new Set(SKILLS.abilities.map((a) => a.id));
		const errors: string[] = [];

		for (const card of allCards) {
			const refs = cardSkills(card.id);
			for (const { ref } of refs) {
				if (!skillIds.has(ref.skillId)) {
					errors.push(`${card.id}: skillId "${ref.skillId}" não existe em skills.json`);
				}
			}
		}

		if (errors.length > 0) {
			throw new Error(`SkillIds inválidos:\n${errors.join("\n")}`);
		}
	});

	it("toda skill é referenciada por ao menos uma carta (ou é detectada pelo índice)", () => {
		const allCards = getAllCards();
		const referencedIds = new Set<string>();
		for (const card of allCards) {
			for (const { def } of cardSkills(card.id)) {
				referencedIds.add(def.id);
			}
		}
		for (const id of referencedIds) {
			expect(skillUsedBy(id).length).toBeGreaterThan(0);
		}
	});
});

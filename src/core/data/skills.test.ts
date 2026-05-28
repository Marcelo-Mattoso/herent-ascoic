import { describe, expect, it } from "vitest";
import { getAllCards } from "./cards";
import { SKILLS } from "./skills";

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
			expect(typeof ability.type).toBe("string");
			expect(typeof ability.trigger).toBe("string");
			expect(typeof ability.target).toBe("string");
			expect(Array.isArray(ability.usedBy)).toBe(true);
		}
	});

	it("todos os usedBy[].card existem em cards.json", () => {
		const allCards = getAllCards();
		const cardNames = new Set(allCards.map((c) => c.name));
		const missing: string[] = [];

		for (const ability of SKILLS.abilities) {
			for (const usage of ability.usedBy) {
				if (!cardNames.has(usage.card)) {
					missing.push(`${ability.id}: usedBy card "${usage.card}" não encontrado`);
				}
			}
		}

		if (missing.length > 0) {
			throw new Error(`Skills com usedBy inválidos:\n${missing.join("\n")}`);
		}
	});

	it("todos os usedBy[].field são válidos para o tipo de carta", () => {
		const allCards = getAllCards();
		const cardMap = new Map(allCards.map((c) => [c.name, c]));
		const errors: string[] = [];

		const validFieldsByType: Record<string, string[]> = {
			hero: ["skill", "power"],
			creature: ["effect", "purpleEffect"],
			subboss: ["effect", "purpleEffect"],
			item: ["effect"],
			artifact: ["effect"],
			room: ["effect"],
			boss: ["abilities"],
		};

		for (const ability of SKILLS.abilities) {
			for (const usage of ability.usedBy) {
				const card = cardMap.get(usage.card);
				if (!card) continue; // já verificado no teste anterior
				const allowed = validFieldsByType[card.type] ?? [];
				if (!allowed.includes(usage.field)) {
					errors.push(
						`${ability.id}: campo "${usage.field}" inválido para tipo "${card.type}" (carta: ${usage.card})`,
					);
				}
			}
		}

		if (errors.length > 0) {
			throw new Error(`Skills com field inválido:\n${errors.join("\n")}`);
		}
	});
});

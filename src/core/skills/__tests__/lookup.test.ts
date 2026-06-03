import { describe, expect, it } from "vitest";
import { getCardByName } from "../../data/cards";
import { cardSkills, lookupSkillById, skillUsedBy } from "../lookup";

describe("cardSkills", () => {
	it("resolve habilidade do Bárbaro Rubro", () => {
		const card = getCardByName("Bárbaro Rubro");
		expect(card).not.toBeUndefined();
		const skills = cardSkills(card!.id);
		const habilidade = skills.find(({ def }) => def.category === "habilidade");
		expect(habilidade).not.toBeUndefined();
		expect(habilidade!.def.id).toBe("skill_crimson_fury");
		// skill_crimson_fury migrada para DSL em patch-21 Lote G
		expect(habilidade!.def.effect).toBeDefined();
	});

	it("resolve poder do Mago das Runas Rubras", () => {
		const card = getCardByName("Mago das Runas Rubras");
		expect(card).not.toBeUndefined();
		const skills = cardSkills(card!.id);
		const poder = skills.find(({ def }) => def.category === "poder_heroi");
		expect(poder).not.toBeUndefined();
		expect(poder!.def.id).toBe("power_supreme_rift_rune");
	});

	it("retorna [] para cardId inexistente", () => {
		expect(cardSkills("id_que_nao_existe")).toEqual([]);
	});

	it("não retorna skill do slot errado — efeito de criatura em herói", () => {
		const card = getCardByName("Bárbaro Rubro");
		expect(card).not.toBeUndefined();
		const skills = cardSkills(card!.id);
		const efeito = skills.find(
			({ def }) => def.category === "habilidade_dungeon",
		);
		expect(efeito).toBeUndefined();
	});
});

describe("lookupSkillById", () => {
	it("retorna a definição pelo id", () => {
		const def = lookupSkillById("skill_crimson_fury");
		expect(def).not.toBeNull();
		expect(def?.id).toBe("skill_crimson_fury");
	});

	it("retorna null para id inexistente", () => {
		expect(lookupSkillById("skill_inexistente")).toBeNull();
	});
});

describe("skillUsedBy", () => {
	it("retorna cards que usam a skill", () => {
		const cards = skillUsedBy("skill_crimson_fury");
		expect(cards.length).toBeGreaterThan(0);
		expect(cards.some((id) => id.includes("crimson_barbarian"))).toBe(true);
	});

	it("retorna [] para skill sem cards", () => {
		expect(skillUsedBy("skill_inexistente")).toEqual([]);
	});
});

import { describe, expect, it } from "vitest";
import {
	getAllCards,
	getBoss,
	getCardById,
	getDiceCount,
	getHeroes,
} from "./cards";
import { getCardName } from "./cardLocale";

describe("catálogo de cartas", () => {
	it("carrega o total correto de cartas", () => {
		expect(getAllCards().length).toBe(80);
	});

	it("retorna 8 heróis", () => {
		expect(getHeroes().length).toBe(8);
	});

	it("getBoss retorna Azhakar", () => {
		const boss = getBoss();
		expect(boss).toBeDefined();
		expect(boss && getCardName(boss.id)).toBe("Azhakar, Dragão da Fornalha Sombria");
		expect(boss?.type).toBe("boss");
	});

	it("getCardById encontra o Bárbaro Rubro", () => {
		const card = getCardById("hero_crimson_barbarian");
		expect(card).toBeDefined();
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(card.damage).toBe(4);
		}
	});

	it("getDiceCount retorna 1 para Branco no Bárbaro Rubro", () => {
		const card = getCardById("hero_crimson_barbarian");
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(getDiceCount(card, 0)).toBe(1);
		}
	});

	it("getDiceCount retorna 3 para Roxo no Bárbaro Rubro", () => {
		const card = getCardById("hero_crimson_barbarian");
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(getDiceCount(card, 4)).toBe(3);
		}
	});

	it("getDiceCount extrai número da string do boss", () => {
		const boss = getBoss();
		expect(boss).toBeDefined();
		if (boss) {
			// "3 dados vermelhos" → 3 (colorIndex ignorado para boss)
			expect(getDiceCount(boss, 0)).toBe(3);
		}
	});

	it("Corredor Estreito tem xp tratado como 0 quando ausente", () => {
		const card = getCardById("room_narrow_corridor");
		expect(card?.type).toBe("room");
		if (card?.type === "room") {
			expect(card.xp ?? 0).toBe(0);
		}
	});

	it("herói tem skills[] com habilidade e poder", () => {
		const card = getCardById("hero_eternal_rest_cleric");
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(Array.isArray(card.skills)).toBe(true);
			expect(card.skills.length).toBe(2);
			expect(card.skills[0].skillId).toBeTruthy();
			expect(card.skills[1].skillId).toBeTruthy();
		}
	});

	it("criatura tem skills[] com pelo menos uma skill", () => {
		const cards = getAllCards();
		const creature = cards.find((c) => c.type === "creature");
		expect(creature).toBeDefined();
		if (creature?.type === "creature") {
			expect(Array.isArray(creature.skills)).toBe(true);
			expect(creature.skills.length).toBeGreaterThan(0);
		}
	});
});

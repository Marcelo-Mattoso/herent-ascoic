import { describe, expect, it } from "vitest";
import {
	getAllCards,
	getBoss,
	getCardByName,
	getDiceCount,
	getHeroes,
} from "./cards";

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
		expect(boss?.name).toBe("Azhakar, Dragão da Fornalha Sombria");
		expect(boss?.type).toBe("boss");
	});

	it("getCardByName encontra o Bárbaro Rubro", () => {
		const card = getCardByName("Bárbaro Rubro");
		expect(card).toBeDefined();
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(card.damage).toBe(4);
		}
	});

	it("getDiceCount retorna 1 para Branco no Bárbaro Rubro", () => {
		const card = getCardByName("Bárbaro Rubro");
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(getDiceCount(card, 0)).toBe(1);
		}
	});

	it("getDiceCount retorna 3 para Roxo no Bárbaro Rubro", () => {
		const card = getCardByName("Bárbaro Rubro");
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
		const card = getCardByName("Corredor Estreito");
		expect(card?.type).toBe("room");
		if (card?.type === "room") {
			expect(card.xp ?? 0).toBe(0);
		}
	});

	it("skill e power do herói são objetos Ability com label", () => {
		const card = getCardByName("Clérigo do Descanso Eterno");
		expect(card?.type).toBe("hero");
		if (card?.type === "hero") {
			expect(typeof card.skill.label).toBe("string");
			expect(card.skill.label.length).toBeGreaterThan(0);
			expect(typeof card.power.label).toBe("string");
			expect(card.power.label.length).toBeGreaterThan(0);
		}
	});

	it("effect de criatura é objeto Ability com label", () => {
		const cards = getAllCards();
		const creature = cards.find((c) => c.type === "creature");
		expect(creature).toBeDefined();
		if (creature?.type === "creature") {
			expect(typeof creature.effect.label).toBe("string");
		}
	});
});

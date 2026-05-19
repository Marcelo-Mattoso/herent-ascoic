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
		expect(getAllCards().length).toBe(79);
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
});

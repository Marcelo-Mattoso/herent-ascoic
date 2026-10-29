import { describe, expect, it } from "vitest";
import ptCards from "../../locales/pt-BR/cards.json";
import enCards from "../../locales/en-US/cards.json";
import esCards from "../../locales/es-ES/cards.json";
import { getCardLocale } from "@/core/data/cardLocale";
import { displayCardClass, displayCardName, displayHeroIdentity } from "./catalogs";

const heroes: Record<string, string> = {
	hero_eternal_rest_cleric: "Letícia Morane",
	hero_broken_bastion_warrior: "Brennar",
	hero_rift_rogue: "Ágatha Veyr",
	hero_crimson_rune_mage: "Andrei Mikhail",
	hero_crimson_barbarian: "Ankhar Varkun",
	hero_last_light_paladin: "Kaelor Arden",
	hero_deep_veil_necromancer: "Zípora Nareth",
	hero_broken_veil_hunter: "Ravik Dorn",
};

const catalogs: Record<string, Record<string, { name: string; characterName?: string }>> = {
	"pt-BR": ptCards,
	"en-US": enCards,
	"es-ES": esCards,
};

describe("nomes próprios dos oito heróis", () => {
	it("preserva o nome exatamente igual nos três pacotes sem substituir a classe", () => {
		for (const [id, characterName] of Object.entries(heroes)) {
			const originalClass = catalogs["pt-BR"][id]?.name;
			expect(originalClass).toBeTruthy();
			expect(originalClass).not.toBe(characterName);
			for (const catalog of Object.values(catalogs)) {
				expect(catalog[id]?.characterName).toBe(characterName);
				expect(catalog[id]?.name).toBeTruthy();
			}
		}
	});

	it("exibe o nome próprio em vez da classe e mantém o catálogo original", () => {
		for (const [id, characterName] of Object.entries(heroes)) {
			expect(displayCardName(id)).toBe(characterName);
			expect(getCardLocale(id)?.characterName).toBe(characterName);
			expect(getCardLocale(id)?.name).not.toBe(characterName);
		}
	});

	it("mantém nome e classe juntos para todos os heróis", () => {
		for (const [id, characterName] of Object.entries(heroes)) {
			const cardClass = catalogs["pt-BR"][id].name;
			expect(displayCardClass(id)).toBe(cardClass);
			expect(displayHeroIdentity(id)).toBe(`${characterName} — ${cardClass}`);
			for (const catalog of Object.values(catalogs)) {
				expect(catalog[id].characterName).toBe(characterName);
				expect(catalog[id].name).toBeTruthy();
			}
		}
	});

	it("preserva o nome traduzido das cartas que não são heróis", () => {
		expect(displayCardName("creature_deep_rift_rat")).toBe("Rato das Fendas Profundas");
	});
});

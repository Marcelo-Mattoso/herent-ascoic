import { describe, expect, it } from "vitest";
import { getAllCards, getCardById } from "./cards";
import { getEnabledExpansions, getExpansionCardMetadata } from "./expansions";

describe("pacotes de expansão", () => {
	it("carrega a Fornalha Sombria sem alterar os 80 IDs originais", () => {
		expect(getEnabledExpansions().map((pack) => pack.id)).toEqual(["fornalha-sombria"]);
		expect(getAllCards()).toHaveLength(80);
		expect(new Set(getAllCards().map((card) => card.id)).size).toBe(80);
	});

	it("mantém atributos de combate e referências de habilidades", () => {
		const card = getCardById("hero_crimson_barbarian");
		expect(card?.type).toBe("hero");
		if (card?.type !== "hero") return;
		expect(card.life).toEqual([12, 14, 16, 18, 20]);
		expect(card.skills[0]?.skillId).toBe("skill_crimson_fury");
	});

	it("associa a imagem pelo ID, independentemente da tradução", () => {
		const meta = getExpansionCardMetadata("hero_crimson_barbarian");
		expect(meta?.expansionId).toBe("fornalha-sombria");
		expect(meta?.image).toBe("images/BárbaroRubro.webp");
	});
	it("usa apenas a pasta images, sem subpastas por categoria", () => {
		const paths = getEnabledExpansions().flatMap((pack) =>
			pack.cards.map((card) => card.image).filter((image) => image !== undefined),
		);
		expect(paths.length).toBe(78);
		for (const image of paths) {
			expect(image).toMatch(/^images\/[^/]+\.webp$/);
		}
	});
});

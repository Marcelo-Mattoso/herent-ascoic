import { describe, expect, it } from "vitest";
import castle from "../../assets/expansions/castelo-horizonte-infindo/expansion.json";
import boss from "../../assets/expansions/castelo-horizonte-infindo/boss.json";
import ptCards from "../../locales/pt-BR/cards.json";
import esCards from "../../locales/es-ES/cards.json";
import ptSkills from "../../locales/pt-BR/skills.json";
import esSkills from "../../locales/es-ES/skills.json";
import ptGame from "../../locales/pt-BR/game.json";
import esGame from "../../locales/es-ES/game.json";

describe("cobertura de tradução do Castelo para espanhol", () => {
	it("traduz todas as 68 cartas, inclusive Therion", () => {
		const cards = [...castle.cards, boss.card];
		expect(cards).toHaveLength(68);
		for (const card of cards) {
			const id = card.id;
			expect((ptCards as Record<string, { name: string }>)[id]?.name).toBeTruthy();
			expect((esCards as Record<string, { name: string }>)[id]?.name).toBeTruthy();
		}
	});

	it("inclui nomes, rótulos e textos das habilidades, com os mesmos parâmetros", () => {
		const ids = [...Object.keys(castle.skillLocales), ...Object.keys(boss.skillLocales)];
		expect(ids).toHaveLength(21);
		const params = (text: string) => [...text.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
			.map((match) => match[1]).sort();
		for (const id of ids) {
			const pt = (ptSkills as Record<string, { name: string; label: string; text: string }>)[id];
			const es = (esSkills as Record<string, { name: string; label: string; text: string }>)[id];
			expect(pt?.name && pt?.label && pt?.text, id).toBeTruthy();
			expect(es?.name && es?.label && es?.text, id).toBeTruthy();
			expect(params(es!.label), id).toEqual(params(pt!.label));
			expect(params(es!.text), id).toEqual(params(pt!.text));
		}
	});

	it("localiza os rótulos de aliados e descrições de artefatos", () => {
		const inventario = esGame.components.inventarioGrupo;
		const detail = esGame.components.modals.cardDetailModal;
		for (const key of ["recruitAlly", "replaceAlly", "allyLabel", "allyPermanent", "artifactType", "itemType"]) {
			expect((inventario as unknown as Record<string, string>)[key]).toBeTruthy();
			expect((ptGame.components.inventarioGrupo as unknown as Record<string, string>)[key]).toBeTruthy();
		}
		expect(detail.slot).toBe("Espacio");
		expect(detail.sharedSlot).toContain("Amuleto");
		expect(esGame.components.artifactRitual.hitBonus).toContain("Acierto");
	});
});

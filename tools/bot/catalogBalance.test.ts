import { describe, expect, it } from "vitest";
import { getAllCards } from "@/core/data/cards";
import { getEnabledExpansions, getExpansionCardMetadata } from "@/core/data/expansions";
import {
	buildCatalogBalance,
	classifyThreat,
	renderCatalogCsv,
	renderCatalogHtml,
	renderCatalogMarkdown,
} from "./catalogBalance";

describe("auditoria estrutural de dificuldade por expansão", () => {
	it("descobre todo o catálogo habilitado sem lista fixa de heróis ou salas", () => {
		const audit = buildCatalogBalance();
		const expansions = getEnabledExpansions();
		expect(audit.expansions.map((p) => p.id)).toEqual(expansions.map((p) => p.id));
		for (const pack of audit.expansions) {
			const cards = getAllCards().filter((c) =>
				getExpansionCardMetadata(c.id)?.expansionId === pack.id);
			expect(pack.heroes.map((c) => c.id)).toEqual(cards.filter((c) => c.type === "hero").map((c) => c.id));
			expect(pack.creatures.map((c) => c.id)).toEqual(cards.filter((c) => c.type === "creature").map((c) => c.id));
			expect(pack.rooms.map((c) => c.id)).toEqual(cards.filter((c) => c.type === "room").map((c) => c.id));
			expect(pack.items.map((c) => c.id)).toEqual(cards.filter((c) => c.type === "item").map((c) => c.id));
			expect(pack.bossId).toBeTruthy();
		}
	});

	it("mantém a Fornalha como referência mesmo selecionando só a Bruxa", () => {
		const all = buildCatalogBalance();
		const witch = all.expansions.find((x) => x.id !== "fornalha-sombria");
		expect(witch).toBeDefined();
		const onlyWitch = buildCatalogBalance([witch!.id]);
		expect(onlyWitch.expansions).toHaveLength(1);
		expect(onlyWitch.creatureThresholds).toEqual(all.creatureThresholds);
		expect(onlyWitch.roomThresholdsByPlayers).toEqual(all.roomThresholdsByPlayers);
		expect(classifyThreat(all.creatureThresholds[0], all.creatureThresholds)).toBe("easy");
	});

	it("conta 1 a 4 heróis por sala e exclui habilidades exclusivas do roxo", () => {
		const audit = buildCatalogBalance();
		for (const pack of audit.expansions) {
			for (const creature of pack.creatures) {
				expect(creature.life).toBeGreaterThan(0);
				expect(creature.score).toBeGreaterThan(0);
				expect(["easy", "medium", "hard"]).toContain(creature.band);
			}
			for (const room of pack.rooms) {
				expect(room.enemiesByPlayers).toHaveLength(4);
				expect(room.scoreByPlayers).toHaveLength(4);
				expect(room.bandByPlayers).toHaveLength(4);
			}
			expect(pack.roomsBelowFourEnemies).toBe(pack.rooms.filter((room) =>
				room.enemiesByPlayers[3]! < 4).length);
			for (let party = 0; party < 4; party++) {
				const groups = pack.roomBandsByPlayers[party]!;
				expect(groups.easy + groups.medium + groups.hard).toBe(pack.rooms.length);
			}
		}
		// Uma criatura com habilidade roxa não deve ter o efeito incluído no índice branco.
		const witch = audit.expansions.find((pack) => pack.id === "torre-grande-bruxa-caldeirao")!;
		const wolf = witch.creatures.find((c) => c.id === "creature_twisted_wood_wolf")!;
		expect(wolf.skills.some((skill) => skill.id === "witch_purple_thorn_retaliation")).toBe(false);
	});

	it("gera saídas HTML/Markdown/CSV reutilizáveis para análise de cartas", () => {
		const audit = buildCatalogBalance();
		const csv = renderCatalogCsv(audit);
		const html = renderCatalogHtml(audit);
		const md = renderCatalogMarkdown(audit);
		expect(csv).toContain("enemies_1_2_3_4");
		expect(csv).toContain("creature_twisted_wood_wolf");
		expect(html).toContain("Índice 4p");
		expect(html).toContain("A Fornalha Sombria");
		expect(md).toContain("Salas para 4 heróis");
		expect(md).toContain("equipamentos");
	});
});

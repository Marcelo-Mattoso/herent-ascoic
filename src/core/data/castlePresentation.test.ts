import { describe, expect, it } from "vitest";
import { getAllCards, getBossById } from "./cards";
import { getSkillLocale } from "./skillLocale";
import { getExpansionCardMetadata } from "./expansions";

const CASTLE_ID = "castelo-horizonte-infindo";

describe("apresentação das cartas do Castelo", () => {
	const cards = getAllCards().filter((card) =>
		getExpansionCardMetadata(card.id)?.expansionId === CASTLE_ID);

	it("os quatro heróis têm habilidade e poder, ambos com texto", () => {
		const heroes = cards.filter((card) => card.type === "hero");
		expect(heroes).toHaveLength(4);
		for (const hero of heroes) {
			expect(hero.skills).toHaveLength(2);
			for (const ref of hero.skills) {
				expect(getSkillLocale(ref.skillId).label?.length).toBeGreaterThan(8);
			}
		}
	});

	it("as criaturas e subchefes têm exatamente uma habilidade roxa descrita", () => {
		const enemies = cards.filter((card) => card.type === "creature" || card.type === "subboss");
		expect(enemies).toHaveLength(20);
		for (const enemy of enemies) {
			const purple = enemy.skills.filter((ref) => ref.requiresAwakening);
			expect(purple).toHaveLength(1);
			expect(getSkillLocale(purple[0]!.skillId).label).toMatch(/Roxo/);
		}
	});

	it("os cinco artefatos correspondem a neutralizações declaradas de Therion", () => {
		const boss = getBossById("boss_therion_infinite_horizon_king");
		const artifacts = cards.filter((card) => card.type === "artifact");
		expect(artifacts).toHaveLength(5);
		for (const artifact of artifacts)
			expect(boss?.artifactCounters?.some((counter) => counter.artifactId === artifact.id)).toBe(true);
	});
});

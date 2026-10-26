import { describe, expect, it } from "vitest";
import { ABILITIES, cardAbilityGrants, lookupAbilityById } from "../../data/abilities";
import { getAllCards, getCardsByType } from "../../data/cards";
import { SKILLS } from "../../data/skills";
import { lookupSkillById } from "../lookup";
import { TRIGGER_EVENT_EMITTERS } from "../resolveSkillWindow";
import { createInitialGameState } from "../../state/gameState";
import { reducer } from "../../reducer";
import { playerView } from "../../projection/playerView";

describe("auditoria estrutural do catálogo Alpha", () => {
	it("todos os IDs são únicos, referenciados e os eventos têm emissores", () => {
		const cards = getAllCards();
		const skillIds = SKILLS.abilities.map((ability) => ability.id);
		const abilityIds = ABILITIES.abilities.map((ability) => ability.id);
		expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
		expect(new Set(skillIds).size).toBe(skillIds.length);
		expect(new Set(abilityIds).size).toBe(abilityIds.length);
		for (const card of cards) {
			for (const ref of card.skills) {
				expect(lookupSkillById(ref.skillId), `${card.id}/${ref.skillId}`).not.toBeNull();
			}
			for (const grant of cardAbilityGrants(card.id)) {
				expect(lookupAbilityById(grant.abilityId), `${card.id}/${grant.id}`).not.toBeNull();
				if (grant.activation.kind === "event") {
					expect(TRIGGER_EVENT_EMITTERS[grant.activation.event!]?.length,
						`${card.id}/${grant.id}/${grant.activation.event}`).toBeGreaterThan(0);
				}
			}
		}
		console.info(`CATÁLOGO ALPHA: ${cards.length} cartas; ${skillIds.length} skills; ${abilityIds.length} abilities; ${getCardsByType("item").length} itens; ${getCardsByType("hero").length} heróis`);
	});

	it("os oito heróis expõem habilidade e poder na projeção do motor", () => {
		const heroes = getCardsByType("hero");
		expect(heroes).toHaveLength(8);
		for (const card of heroes) {
			const base = createInitialGameState({ heroCardIds: [card.id] });
			const state = reducer(base, { type: "START_GAME", payload: { heroCardIds: [card.id] } });
			const heroId = state.heroes[0]!.id;
			const actions = playerView(state).abilityActionsByHero[heroId];
			expect(actions?.some((action) => action.kind === "skill"), card.id).toBe(true);
			expect(actions?.some((action) => action.kind === "power"), card.id).toBe(true);
		}
	});
});

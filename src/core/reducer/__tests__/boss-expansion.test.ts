import { describe, expect, it } from "vitest";
import { getBoss, getBossById, getAllCards } from "../../data/cards";
import { getExpansionCardMetadata } from "../../data/expansions";
import { SKILLS } from "../../data/skills";
import { inlineBossDamageReduction, inlineBossHitBonus, markInlineBossSkillsUsed } from "../../rules/bossSkills";
import { testEngine } from "../../__tests__/testEngine";
import { decksOf, enemiesOf, withAwakening } from "../../state/access";
import { createInitialGameState } from "../../state/gameState";
import { gameOf, withGame } from "../../../engine/state";
import { handleRevealBoss } from "../boss";
import { handleStartGame } from "../setup";

const bossId = "boss_azhakar";
const heart = "artifact_ancient_ember_heart";
const artifactIds = [
	"artifact_crimson_jailer_chain",
	"artifact_lost_forge_hammer",
	"artifact_last_vigil_brazier",
];

function withArtifacts(ids: readonly string[], despertar: 0 | 1 | 2 | 3 | 4 = 0) {
	const state = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"], bossCardId: bossId });
	return withAwakening(withGame(state, (game) => ({
		...game,
		bossCardId: bossId,
		groupArtifacts: ids.map((cardId) => ({ cardId, carriedBy: null })),
	})), despertar);
}

describe("boss separado por expansão", () => {
	it("expõe uma ficha de Azhakar e as skills exclusivas do pacote", () => {
		const boss = getBoss("fornalha-sombria");
		expect(boss?.id).toBe(bossId);
		expect(boss?.dice).toBe(3);
		expect(boss?.accessCondition).toEqual({ type: "group_artifacts_gte", value: 3 });
		expect(boss?.artifactBonus).toEqual({ artifactId: heart, lifeBase: 16 });
		expect(getBoss("inexistente")).toBeUndefined();
		expect(getBossById(bossId)).toEqual(boss);
		expect(getAllCards().filter((card) => card.type === "boss")).toHaveLength(2);
		for (const skill of boss?.skills ?? []) {
			expect(SKILLS.abilities.some((def) => def.id === skill.skillId)).toBe(true);
		}
	});

	it("não revela o boss com menos de três artefatos", () => {
		const blocked = handleRevealBoss(testEngine, withArtifacts(artifactIds.slice(0, 2)));
		expect(enemiesOf(blocked)).toHaveLength(0);
		expect(gameOf(blocked).status).not.toBe("BOSS_COMBAT");
	});

	it("três artefatos sem o Coração mantêm 20 de Vida-base", () => {
		const revealed = handleRevealBoss(testEngine, withArtifacts(artifactIds));
		expect(gameOf(revealed).status).toBe("BOSS_COMBAT");
		expect(enemiesOf(revealed)[0]?.maxLife).toBe(20);
		expect(enemiesOf(revealed)[0]?.dice).toBe(3);
	});

	it("Coração entre os três artefatos reduz a Vida-base para 16", () => {
		const ids = [heart, ...artifactIds.slice(0, 2)];
		const revealed = handleRevealBoss(testEngine, withArtifacts(ids));
		expect(enemiesOf(revealed)[0]?.maxLife).toBe(16);
	});

	it("aplica a escala de Despertar após o bônus do Coração", () => {
		const ids = [heart, ...artifactIds.slice(0, 2)];
		const revealed = handleRevealBoss(testEngine, withArtifacts(ids, 4));
		expect(enemiesOf(revealed)[0]?.maxLife).toBe(24);
		expect(enemiesOf(revealed)[0]?.hitBonus).toBe(16);
	});

	it("executa os modificadores declarados do chefe sem repetir na mesma rodada", () => {
		const state = handleRevealBoss(testEngine, withArtifacts(artifactIds));
		const boss = enemiesOf(state)[0]!;
		expect(inlineBossDamageReduction(testEngine, state, boss).amount).toBe(1);
		const used = markInlineBossSkillsUsed(state, inlineBossDamageReduction(testEngine, state, boss).usedIds);
		expect(inlineBossDamageReduction(testEngine, used, boss).amount).toBe(0);
		expect(inlineBossHitBonus(testEngine, boss)).toBe(0);
		expect(inlineBossHitBonus(testEngine, { ...boss, currentLife: 10 })).toBe(2);
	});

	it("usa apenas cartas da expansão escolhida ao montar os decks", () => {
		const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = handleStartGame(testEngine, initial, {
			heroCardIds: ["hero_crimson_barbarian"],
			bossCardId: bossId,
			seed: 123,
			deferInitialRoomReveal: true,
		});
		const ids = [
			...decksOf(state).dungeonDeck.available,
			...decksOf(state).enemyDeck.available,
			...decksOf(state).itemDeck.available,
			...decksOf(state).artifactDeck.available,
		];
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((id) => getExpansionCardMetadata(id)?.expansionId === "fornalha-sombria")).toBe(true);
	});
	it("permite heróis de ambas as expansões e isola os decks pelo boss", () => {
		const chosen = ["hero_crimson_barbarian", "hero_white_ashes_sister"];
		for (const [bossId, expansionId] of [
			["boss_azhakar", "fornalha-sombria"],
			["boss_great_cauldron_witch", "torre-grande-bruxa-caldeirao"],
		] as const) {
			const state = handleStartGame(testEngine,
				createInitialGameState({ heroCardIds: chosen, bossCardId: bossId }), {
					heroCardIds: chosen, bossCardId: bossId, difficulty: "normal",
					seed: 123, deferInitialRoomReveal: true,
				});
			expect(gameOf(state).bossCardId).toBe(bossId);
			expect(gameOf(state).heroes.map((hero) => hero.cardId)).toEqual(chosen);
			const decks = decksOf(state);
			for (const deck of [decks.dungeonDeck, decks.enemyDeck, decks.itemDeck, decks.artifactDeck]) {
				expect(deck.available.length).toBeGreaterThan(0);
				expect(deck.available.every((id) => getExpansionCardMetadata(id)?.expansionId === expansionId)).toBe(true);
			}
		}
	});

});

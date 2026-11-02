import { describe, expect, it } from "vitest";
import { getBoss, getBossById, getAllCards } from "../../data/cards";
import { getExpansionCardMetadata } from "../../data/expansions";
import { SKILLS } from "../../data/skills";
import { inlineBossDamageReduction, inlineBossHitBonus, markInlineBossSkillsUsed } from "../../rules/bossSkills";
import { createInitialGameState } from "../../state/gameState";
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
	return {
		...state,
		despertar,
		bossCardId: bossId,
		groupArtifacts: ids.map((cardId) => ({ cardId, carriedBy: null })),
	};
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
		expect(getAllCards().filter((card) => card.type === "boss")).toHaveLength(1);
		for (const skill of boss?.skills ?? []) {
			expect(SKILLS.abilities.some((def) => def.id === skill.skillId)).toBe(true);
		}
	});

	it("não revela o boss com menos de três artefatos", () => {
		const blocked = handleRevealBoss(withArtifacts(artifactIds.slice(0, 2)));
		expect(blocked.activeEnemies).toHaveLength(0);
		expect(blocked.status).not.toBe("BOSS_COMBAT");
	});

	it("três artefatos sem o Coração mantêm 20 de Vida-base", () => {
		const revealed = handleRevealBoss(withArtifacts(artifactIds));
		expect(revealed.status).toBe("BOSS_COMBAT");
		expect(revealed.activeEnemies[0]?.maxLife).toBe(20);
		expect(revealed.activeEnemies[0]?.dice).toBe(3);
	});

	it("Coração entre os três artefatos reduz a Vida-base para 16", () => {
		const ids = [heart, ...artifactIds.slice(0, 2)];
		const revealed = handleRevealBoss(withArtifacts(ids));
		expect(revealed.activeEnemies[0]?.maxLife).toBe(16);
	});

	it("aplica a escala de Despertar após o bônus do Coração", () => {
		const ids = [heart, ...artifactIds.slice(0, 2)];
		const revealed = handleRevealBoss(withArtifacts(ids, 4));
		expect(revealed.activeEnemies[0]?.maxLife).toBe(24);
		expect(revealed.activeEnemies[0]?.hitBonus).toBe(16);
	});

	it("executa os modificadores declarados do chefe sem repetir na mesma rodada", () => {
		const state = handleRevealBoss(withArtifacts(artifactIds));
		const boss = state.activeEnemies[0]!;
		expect(inlineBossDamageReduction(state, boss).amount).toBe(1);
		const used = markInlineBossSkillsUsed(state, inlineBossDamageReduction(state, boss).usedIds);
		expect(inlineBossDamageReduction(used, boss).amount).toBe(0);
		expect(inlineBossHitBonus(boss)).toBe(0);
		expect(inlineBossHitBonus({ ...boss, currentLife: 10 })).toBe(2);
	});

	it("usa apenas cartas da expansão escolhida ao montar os decks", () => {
		const initial = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const state = handleStartGame(initial, {
			heroCardIds: ["hero_crimson_barbarian"],
			bossCardId: bossId,
			seed: 123,
			deferInitialRoomReveal: true,
		});
		const ids = [
			...state.decks.dungeonDeck.available,
			...state.decks.enemyDeck.available,
			...state.decks.itemDeck.available,
			...state.decks.artifactDeck.available,
		];
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((id) => getExpansionCardMetadata(id)?.expansionId === "fornalha-sombria")).toBe(true);
	});
});

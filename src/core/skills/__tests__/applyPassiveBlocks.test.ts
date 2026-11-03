import { describe, expect, it } from "vitest";
import { handleBossResolveAttack, handleRevealBoss } from "../../reducer/boss";
import { reducer } from "../../reducer";
import { lowerDespertar } from "../../reducer/progression";
import { removeBlocksForSource } from "../../state/blockHelpers";
import { createInitialGameState } from "../../state/gameState";
import { applyDeclaredPassiveBlocks } from "../applyPassiveBlocks";
import { testEngine } from "@/core/__tests__/testEngine";
import { awakeningOf, deckOf, withAwakening, withDeck } from "@/core/state/access";
import { gameOf, withGame } from "../../../engine/state";

describe("applyDeclaredPassiveBlocks", () => {
	it("ativa Confinamento enquanto a sala está em jogo e o remove ao sair", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const blocked = applyDeclaredPassiveBlocks(testEngine, initial, {
			cardId: "room_crimson_chains_chamber",
			entityId: "room_crimson_chains_chamber",
		});
		expect(gameOf(blocked).flags.fleeBlocked).toBe(true);
		expect(gameOf(blocked).blocks.fleeBlocked?.[0]?.sourceEntityId).toBe(
			"room_crimson_chains_chamber",
		);

		const cleared = removeBlocksForSource(
			blocked,
			"room_crimson_chains_chamber",
		);
		expect(gameOf(cleared).flags.fleeBlocked).toBe(false);
	});

	it("respeita requisito roxo e bloqueia a redução do Despertar só no roxo", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const inactive = applyDeclaredPassiveBlocks(testEngine, initial, {
			cardId: "creature_old_chains_knight",
			entityId: "e1",
			sourceEnemyId: "e1",
		});
		expect(gameOf(inactive).flags.dungeonLevelReductionBlocked).toBeUndefined();

		const purple = applyDeclaredPassiveBlocks(testEngine, 
			withAwakening(initial, 4),
			{
				cardId: "creature_old_chains_knight",
				entityId: "e1",
				sourceEnemyId: "e1",
			},
		);
		expect(gameOf(purple).flags.dungeonLevelReductionBlocked).toBe(true);
		expect(awakeningOf(lowerDespertar(testEngine, purple))).toBe(4);
	});
});

const AzhakarArtifacts = [
	{ cardId: "artifact_crimson_jailer_chain", carriedBy: null },
	{ cardId: "artifact_ancient_ember_heart", carriedBy: null },
	{ cardId: "artifact_lost_forge_hammer", carriedBy: null },
];

describe("boss content setup", () => {
	it("revela Azhakar também como entidade ECS", () => {
		const state = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
			bossCardId: "boss_azhakar",
		});
		const revealed = handleRevealBoss(testEngine, withGame(state, (g) => ({ ...g, groupArtifacts: AzhakarArtifacts })));
		expect(gameOf(revealed).activeEnemies[0]?.id).toBe("boss");
		expect(gameOf(revealed).world.entities.boss?.type).toBe("enemy");
	});

	it("aplica Pressão da Forja Sombria ao fim da rodada roxa", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const started = reducer(testEngine, initial, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});
		const revealed = handleRevealBoss(testEngine, withGame(withAwakening(started, 4), (g) => ({ ...g, groupArtifacts: AzhakarArtifacts })));
		const heroId = gameOf(revealed).heroes[0]!.id;
		const prepared = withDeck(revealed, "dungeonDeck", {
			...deckOf(revealed, "dungeonDeck"),
			available: ["room_dungeon_room"],
			discarded: [],
		});
		const result = handleBossResolveAttack(testEngine, withGame(prepared, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(prepared).combat!,
				lastRoll: {
					heroId,
					enemyId: "boss",
					heroResults: [1],
					heroTotal: 0,
					heroBreakdown: [],
					enemyResults: [6],
					enemyTotal: 99,
					enemyBreakdown: [],
				},
			} })));
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(0);
		expect(deckOf(result, "dungeonDeck").discarded).toContain("room_dungeon_room");
	});
});

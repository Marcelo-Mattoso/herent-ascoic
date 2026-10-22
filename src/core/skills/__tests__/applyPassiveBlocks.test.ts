import { describe, expect, it } from "vitest";
import { handleBossResolveAttack, handleRevealBoss } from "../../reducer/boss";
import { reducer } from "../../reducer";
import { lowerDespertar } from "../../reducer/progression";
import { removeBlocksForSource } from "../../state/blockHelpers";
import { createInitialGameState } from "../../state/gameState";
import { applyDeclaredPassiveBlocks } from "../applyPassiveBlocks";

describe("applyDeclaredPassiveBlocks", () => {
	it("ativa Confinamento enquanto a sala está em jogo e o remove ao sair", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const blocked = applyDeclaredPassiveBlocks(initial, {
			cardId: "room_crimson_chains_chamber",
			entityId: "room_crimson_chains_chamber",
		});
		expect(blocked.flags.fleeBlocked).toBe(true);
		expect(blocked.blocks.fleeBlocked?.[0]?.sourceEntityId).toBe(
			"room_crimson_chains_chamber",
		);

		const cleared = removeBlocksForSource(
			blocked,
			"room_crimson_chains_chamber",
		);
		expect(cleared.flags.fleeBlocked).toBe(false);
	});

	it("respeita requisito roxo e bloqueia a redução do Despertar só no roxo", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const inactive = applyDeclaredPassiveBlocks(initial, {
			cardId: "creature_old_chains_knight",
			entityId: "e1",
			sourceEnemyId: "e1",
		});
		expect(inactive.flags.dungeonLevelReductionBlocked).toBeUndefined();

		const purple = applyDeclaredPassiveBlocks(
			{ ...initial, despertar: 4 },
			{
				cardId: "creature_old_chains_knight",
				entityId: "e1",
				sourceEnemyId: "e1",
			},
		);
		expect(purple.flags.dungeonLevelReductionBlocked).toBe(true);
		expect(lowerDespertar(purple).despertar).toBe(4);
	});
});

describe("boss content setup", () => {
	it("revela Azhakar também como entidade ECS", () => {
		const state = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const revealed = handleRevealBoss(state);
		expect(revealed.activeEnemies[0]?.id).toBe("boss");
		expect(revealed.world.entities.boss?.type).toBe("enemy");
	});

	it("aplica Pressão da Forja Sombria ao fim da rodada roxa", () => {
		const initial = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const started = reducer(initial, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});
		const revealed = handleRevealBoss({ ...started, despertar: 4 });
		const heroId = revealed.heroes[0]!.id;
		const result = handleBossResolveAttack({
			...revealed,
			decks: {
				...revealed.decks,
				dungeonDeck: {
					...revealed.decks.dungeonDeck,
					available: ["room_dungeon_room"],
					discarded: [],
				},
			},
			combat: {
				...revealed.combat!,
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
			},
		});
		expect(result.decks.dungeonDeck.available).toHaveLength(0);
		expect(result.decks.dungeonDeck.discarded).toContain("room_dungeon_room");
	});
});

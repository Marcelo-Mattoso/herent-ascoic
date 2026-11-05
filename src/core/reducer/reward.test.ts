import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import {
	distributeItemAuto,
	handleChooseArtifactBearer,
	handleChooseItemDestination,
	handleInvAssignArtifact,
	handleInvDescartarMesa,
	handleInvMove,
	handleInvSetBearer,
	handleGrantRewards,
} from "./reward";
import { handleGainXp, handleSpendXp } from "./progression";
import { reducer } from "./index";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, heroesOf, impetoOf, withDecks, withImpeto } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { pendingSkillChoiceOf } from "../state/access";
import { withGame, gameOf } from "../../engine/state";

const DAGGER = "item_rusty_dagger";
const PITCH_TORCH = "item_pitch_torch";
const VIGOR_POTION = "item_lesser_vigor_potion";

function state(): GameState {
	const base = createInitialGameState({ heroCardIds: [] });
	const hero: HeroState = { id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10, damage: 3, hitBonus: 0, dice: 2, activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0 };
	return settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [hero], status: "REWARD_PHASE" })));
}

describe("recompensas e inventário", () => {
	it("atribui item para mochila, equipa e conclui a fase", () => {
		const base = withGame(state(), (prevGame) => ({ ...prevGame, pendingRewards: [{ type: "item" as const, cardId: DAGGER, requiresBearer: false }] }));
		const equipped = handleChooseItemDestination(testEngine, base, "h1", "equip");
		expect(heroesOf(equipped)[0]?.activeItems.hand1).toBe(DAGGER);
		expect(gameOf(equipped).status).toBe("XP_SPEND_PHASE");
		const backpack = handleChooseItemDestination(testEngine, base, "h1", "backpack");
		expect(heroesOf(backpack)[0]?.backpack).toContain(DAGGER);
		expect(gameOf(handleChooseItemDestination(testEngine, base, "h1", "discard")).pendingRewards).toEqual([]);
	});

	it("atribui artefato, altera portador e descarta mesa", () => {
		const base = withGame(state(), (prevGame) => ({ ...prevGame, pendingRewards: [{ type: "artifact" as const, cardId: "artifact_ancient_orb", requiresBearer: true }] }));
		const chosen = handleChooseArtifactBearer(testEngine, base, "h1");
		expect(gameOf(chosen).groupArtifacts[0]).toMatchObject({ carriedBy: "h1" });
		const assigned = handleInvAssignArtifact(testEngine, base, "artifact_ancient_orb", 0, null);
		expect(gameOf(assigned).groupArtifacts[0]?.carriedBy).toBeNull();
		expect(gameOf(handleInvSetBearer(assigned, 0, "h1")).groupArtifacts[0]?.carriedBy).toBe("h1");
		expect(gameOf(handleInvDescartarMesa(base)).status).toBe("XP_SPEND_PHASE");
	});

	it("move itens entre mesa, mochila e equipamento, preservando a origem inválida", () => {
		const base = withGame(state(), (prevGame) => ({ ...prevGame, pendingRewards: [{ type: "item" as const, cardId: DAGGER, requiresBearer: false }] }));
		const backpack = handleInvMove(testEngine, base, DAGGER, { kind: "mesa" }, { kind: "hero_backpack", heroId: "h1" });
		expect(heroesOf(backpack)[0]?.backpack).toContain(DAGGER);
		const equipped = handleInvMove(testEngine, backpack, DAGGER, { kind: "hero_backpack", heroId: "h1", index: 0 }, { kind: "hero_equip", heroId: "h1" });
		expect(heroesOf(equipped)[0]?.activeItems.hand1).toBe(DAGGER);
		expect(handleInvMove(testEngine, base, DAGGER, { kind: "hero_backpack", heroId: "h1", index: 0 }, { kind: "mesa" })).toBe(base);
	});

	it("equipa um item utilitário no slot de utilidade, inclusive a partir da mochila", () => {
		const reward = withGame(state(), (prevGame) => ({ ...prevGame, pendingRewards: [
				{ type: "item" as const, cardId: PITCH_TORCH, requiresBearer: false },
			] }));
		const equippedFromReward = handleChooseItemDestination(testEngine, reward, "h1", "equip");
		expect(heroesOf(equippedFromReward)[0]?.activeItems.hand1).toBe(
			PITCH_TORCH,
		);
		expect(heroesOf(equippedFromReward)[0]?.activeItems.hand2).toBeUndefined();

		const backpackState = state();
		const hero = heroesOf(backpackState)[0];
		if (!hero) throw new Error("Herói de teste ausente.");
		const fromBackpack = settled(withGame(backpackState, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, backpack: [PITCH_TORCH] }] })));
		const equippedFromBackpack = handleInvMove(testEngine, 
			fromBackpack,
			PITCH_TORCH,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(heroesOf(equippedFromBackpack)[0]?.activeItems.hand1).toBe(
			PITCH_TORCH,
		);
		expect(heroesOf(equippedFromBackpack)[0]?.backpack).toEqual([]);
	});

	it("poção com espaço de uma mão pode ser equipada ou guardada", () => {
		const reward = withGame(state(), (prevGame) => ({ ...prevGame, pendingRewards: [
				{ type: "item" as const, cardId: VIGOR_POTION, requiresBearer: false },
			] }));
		const equipped = handleChooseItemDestination(testEngine, reward, "h1", "equip");
		expect(heroesOf(equipped)[0]?.activeItems.hand1).toBe(VIGOR_POTION);
		const stored = handleChooseItemDestination(testEngine, reward, "h1", "backpack");
		expect(heroesOf(stored)[0]?.backpack).toEqual([VIGOR_POTION]);
	});

	it("resolve Espólios da Fornalha na vitória e substitui o saque normal", () => {
		const base = withDecks(withGame(state(), (prevGame) => ({ ...prevGame, currentRoom: {
				cardId: "room_abandoned_cell",
				exits: 3,
				currentEnemies: 0,
				reward: 1,
				rewardType: "item" as const,
				effect: "Espólios da Fornalha",
				xp: 1,
				status: "active" as const,
			} })), {
				...decksOf(state()),
				itemDeck: {
					...deckOf(state(), "itemDeck"),
					available: [DAGGER, PITCH_TORCH, VIGOR_POTION],
				},
			});

		const waiting = handleGrantRewards(testEngine, base);
		expect(pendingSkillChoiceOf(waiting)?.skillId).toBe(
			"dungeon_skill_forge_spoils",
		);
		expect(gameOf(waiting).pendingRewards).toEqual([]);

		const resolved = reducer(testEngine, waiting, {
			type: "SKILL_CHOICE",
			payload: {
				skillId: "dungeon_skill_forge_spoils",
				choice: DAGGER,
			},
		});

		expect(pendingSkillChoiceOf(resolved)).toBeUndefined();
		expect(gameOf(resolved).pendingRewards.map((reward) => reward.cardId)).toEqual([
			DAGGER,
		]);
		expect(deckOf(resolved, "itemDeck").discarded).toContain(PITCH_TORCH);
		expect(deckOf(resolved, "itemDeck").available).toEqual([VIGOR_POTION]);
		expect(gameOf(resolved).currentRoom?.status).toBe("cleared");
		expect(gameOf(resolved).groupXp).toBe(1);
	});

	it("resolve Forja Reacesa na vitória antes das recompensas normais", () => {
		const base = withDecks(withGame(state(), (prevGame) => ({ ...prevGame, currentRoom: {
				cardId: "room_ruined_forge",
				exits: 3,
				currentEnemies: 0,
				reward: 2,
				rewardType: "item" as const,
				effect: "Forja Reacesa",
				xp: 2,
				status: "active" as const,
			} })), {
				...decksOf(state()),
				itemDeck: {
					...deckOf(state(), "itemDeck"),
					available: [DAGGER, PITCH_TORCH, VIGOR_POTION],
				},
			});

		const resolved = handleGrantRewards(testEngine, base);
		expect(gameOf(resolved).currentRoom?.status).toBe("cleared");
		expect(gameOf(resolved).groupXp).toBe(2);
		expect(gameOf(resolved).pendingRewards.map((reward) => reward.cardId)).toEqual([
			DAGGER,
			PITCH_TORCH,
			VIGOR_POTION,
		]);
	});

	it("ganha e gasta XP: compra item, falha sem saldo e usa distribuição automática", () => {
		const gained = handleGainXp(state(), 20);
		expect(gameOf(gained).groupXp).toBe(20);
		const insufficient = handleSpendXp(testEngine, state(), "buy_item");
		expect(gameOf(insufficient).groupXp).toBe(0);
		const deck = withDecks({ ...gained, }, { ...decksOf(gained), itemDeck: { ...deckOf(gained, "itemDeck"), available: [DAGGER] } });
		const bought = handleSpendXp(testEngine, deck, "buy_item");
		expect(gameOf(bought).pendingRewards[0]?.cardId).toBe(DAGGER);
		expect(gameOf(distributeItemAuto(testEngine, withGame(state(), (prevGame) => ({ ...prevGame, status: "HERO_ACTION" })), DAGGER)).heroes[0]?.activeItems.hand1).toBe(DAGGER);
	});

	it("exige a escolha do herói antes de gastar XP para subir de nível", () => {
		const base = state();
		const secondHero: HeroState = {
			...heroesOf(base)[0]!,
			id: "h2",
			cardId: "hero_eternal_rest_cleric",
		};
		const withXp = withImpeto(settled(withGame(base, (prevGame) => ({ ...prevGame, groupXp: 20, heroes: [...heroesOf(base), secondHero] }))), "h2", 1);

		const withoutTarget = handleSpendXp(testEngine, withXp, "level_up");
		expect(gameOf(withoutTarget).groupXp).toBe(20);
		expect(heroesOf(withoutTarget).map((hero) => impetoOf(withoutTarget, hero.id))).toEqual([0, 1]);

		const levelled = handleSpendXp(testEngine, withXp, "level_up", "h2");
		expect(gameOf(levelled).groupXp).toBe(10);
		expect(heroesOf(levelled).map((hero) => impetoOf(levelled, hero.id))).toEqual([0, 2]);
	});
	it("Bruxa: compra artefato com 35 XP sem misturar expansões e preserva XP quando esgotado", () => {
		const heroIds = ["hero_oak_guardian"];
		const started = reducer(testEngine, createInitialGameState({ heroCardIds: heroIds }), {
			type: "START_GAME",
			payload: {
				heroCardIds: heroIds,
				bossCardId: "boss_great_cauldron_witch",
				seed: 42,
				deferInitialRoomReveal: true,
			},
		});
		const funded = withGame(started, (game) => ({ ...game, status: "XP_SPEND_PHASE" as const, groupXp: 35 }));
		expect(deckOf(funded, "artifactDeck").available).toHaveLength(4);
		const bought = handleSpendXp(testEngine, funded, "buy_artifact");
		expect(gameOf(bought).groupXp).toBe(0);
		expect(gameOf(bought).groupArtifacts).toHaveLength(1);
		expect(gameOf(bought).groupArtifacts[0]?.cardId).toMatch(/^artifact_/);
		expect(deckOf(bought, "artifactDeck").available).toHaveLength(3);
		const empty = withDecks(withGame(bought, (game) => ({ ...game, groupXp: 35 })), {
			...decksOf(bought),
			artifactDeck: { ...deckOf(bought, "artifactDeck"), available: [] },
		});
		const refused = handleSpendXp(testEngine, empty, "buy_artifact");
		expect(gameOf(refused).groupXp).toBe(35);
		expect(gameOf(refused).groupArtifacts).toHaveLength(1);
	});

});

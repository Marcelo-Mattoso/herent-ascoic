import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../state/gameState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import {
	distributeItemAuto,
	handleChooseArtifactBearer,
	handleChooseItemDestination,
	handleGainXp,
	handleInvAssignArtifact,
	handleInvDescartarMesa,
	handleInvMove,
	handleInvSetBearer,
	handleGrantRewards,
	handleSpendXp,
} from "./reward";
import { reducer } from "./index";

const DAGGER = "item_rusty_dagger";
const PITCH_TORCH = "item_pitch_torch";
const VIGOR_POTION = "item_lesser_vigor_potion";

function state(): GameState {
	const base = createInitialGameState({ heroCardIds: [] });
	const hero: HeroState = { id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10, damage: 3, hitBonus: 0, dice: 2, impeto: 0, activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0 };
	return { ...base, heroes: [hero], status: "REWARD_PHASE" };
}

describe("recompensas e inventário", () => {
	it("atribui item para mochila, equipa e conclui a fase", () => {
		const base = { ...state(), pendingRewards: [{ type: "item" as const, cardId: DAGGER, requiresBearer: false }] };
		const equipped = handleChooseItemDestination(base, "h1", "equip");
		expect(equipped.heroes[0]?.activeItems.weapon).toBe(DAGGER);
		expect(equipped.status).toBe("XP_SPEND_PHASE");
		const backpack = handleChooseItemDestination(base, "h1", "backpack");
		expect(backpack.heroes[0]?.backpack).toContain(DAGGER);
		expect(handleChooseItemDestination(base, "h1", "discard").pendingRewards).toEqual([]);
	});

	it("atribui artefato, altera portador e descarta mesa", () => {
		const base = { ...state(), pendingRewards: [{ type: "artifact" as const, cardId: "artifact_ancient_orb", requiresBearer: true }] };
		const chosen = handleChooseArtifactBearer(base, "h1");
		expect(chosen.groupArtifacts[0]).toMatchObject({ carriedBy: "h1" });
		const assigned = handleInvAssignArtifact(base, "artifact_ancient_orb", 0, null);
		expect(assigned.groupArtifacts[0]?.carriedBy).toBeNull();
		expect(handleInvSetBearer(assigned, 0, "h1").groupArtifacts[0]?.carriedBy).toBe("h1");
		expect(handleInvDescartarMesa(base).status).toBe("XP_SPEND_PHASE");
	});

	it("move itens entre mesa, mochila e equipamento, preservando a origem inválida", () => {
		const base = { ...state(), pendingRewards: [{ type: "item" as const, cardId: DAGGER, requiresBearer: false }] };
		const backpack = handleInvMove(base, DAGGER, { kind: "mesa" }, { kind: "hero_backpack", heroId: "h1" });
		expect(backpack.heroes[0]?.backpack).toContain(DAGGER);
		const equipped = handleInvMove(backpack, DAGGER, { kind: "hero_backpack", heroId: "h1", index: 0 }, { kind: "hero_equip", heroId: "h1" });
		expect(equipped.heroes[0]?.activeItems.weapon).toBe(DAGGER);
		expect(handleInvMove(base, DAGGER, { kind: "hero_backpack", heroId: "h1", index: 0 }, { kind: "mesa" })).toBe(base);
	});

	it("equipa um item utilitário no slot de utilidade, inclusive a partir da mochila", () => {
		const reward = {
			...state(),
			pendingRewards: [
				{ type: "item" as const, cardId: PITCH_TORCH, requiresBearer: false },
			],
		};
		const equippedFromReward = handleChooseItemDestination(reward, "h1", "equip");
		expect(equippedFromReward.heroes[0]?.activeItems.utility).toBe(
			PITCH_TORCH,
		);
		expect(equippedFromReward.heroes[0]?.activeItems.weapon).toBeUndefined();

		const backpackState = state();
		const hero = backpackState.heroes[0];
		if (!hero) throw new Error("Herói de teste ausente.");
		const fromBackpack = {
			...backpackState,
			heroes: [{ ...hero, backpack: [PITCH_TORCH] }],
		};
		const equippedFromBackpack = handleInvMove(
			fromBackpack,
			PITCH_TORCH,
			{ kind: "hero_backpack", heroId: "h1", index: 0 },
			{ kind: "hero_equip", heroId: "h1" },
		);
		expect(equippedFromBackpack.heroes[0]?.activeItems.utility).toBe(
			PITCH_TORCH,
		);
		expect(equippedFromBackpack.heroes[0]?.backpack).toEqual([]);
	});

	it("equipa poção no slot de consumível em vez de enviá-la à mochila", () => {
		const reward = {
			...state(),
			pendingRewards: [
				{ type: "item" as const, cardId: VIGOR_POTION, requiresBearer: false },
			],
		};
		const equipped = handleChooseItemDestination(reward, "h1", "equip");
		expect(equipped.heroes[0]?.activeItems.consumable).toBe(VIGOR_POTION);
		expect(equipped.heroes[0]?.backpack).toEqual([]);
	});

	it("resolve Espólios da Fornalha na vitória e substitui o saque normal", () => {
		const base = {
			...state(),
			currentRoom: {
				cardId: "room_abandoned_cell",
				exits: 3,
				currentEnemies: 0,
				reward: 1,
				rewardType: "item" as const,
				effect: "Espólios da Fornalha",
				xp: 1,
				status: "active" as const,
			},
			decks: {
				...state().decks,
				itemDeck: {
					...state().decks.itemDeck,
					available: [DAGGER, PITCH_TORCH, VIGOR_POTION],
				},
			},
		};

		const waiting = handleGrantRewards(base);
		expect(waiting.pendingSkillChoice?.skillId).toBe(
			"dungeon_skill_forge_spoils",
		);
		expect(waiting.pendingRewards).toEqual([]);

		const resolved = reducer(waiting, {
			type: "SKILL_CHOICE",
			payload: {
				skillId: "dungeon_skill_forge_spoils",
				choice: DAGGER,
			},
		});

		expect(resolved.pendingSkillChoice).toBeUndefined();
		expect(resolved.pendingRewards.map((reward) => reward.cardId)).toEqual([
			DAGGER,
		]);
		expect(resolved.decks.itemDeck.discarded).toContain(PITCH_TORCH);
		expect(resolved.decks.itemDeck.available).toEqual([VIGOR_POTION]);
		expect(resolved.currentRoom?.status).toBe("cleared");
		expect(resolved.groupXp).toBe(1);
	});

	it("resolve Forja Reacesa na vitória antes das recompensas normais", () => {
		const base = {
			...state(),
			currentRoom: {
				cardId: "room_ruined_forge",
				exits: 3,
				currentEnemies: 0,
				reward: 2,
				rewardType: "item" as const,
				effect: "Forja Reacesa",
				xp: 2,
				status: "active" as const,
			},
			decks: {
				...state().decks,
				itemDeck: {
					...state().decks.itemDeck,
					available: [DAGGER, PITCH_TORCH, VIGOR_POTION],
				},
			},
		};

		const resolved = handleGrantRewards(base);
		expect(resolved.currentRoom?.status).toBe("cleared");
		expect(resolved.groupXp).toBe(2);
		expect(resolved.pendingRewards.map((reward) => reward.cardId)).toEqual([
			DAGGER,
			PITCH_TORCH,
			VIGOR_POTION,
		]);
	});

	it("ganha e gasta XP: compra item, falha sem saldo e usa distribuição automática", () => {
		const gained = handleGainXp(state(), 20);
		expect(gained.groupXp).toBe(20);
		const insufficient = handleSpendXp(state(), "buy_item");
		expect(insufficient.groupXp).toBe(0);
		const deck = { ...gained, decks: { ...gained.decks, itemDeck: { ...gained.decks.itemDeck, available: [DAGGER] } } };
		const bought = handleSpendXp(deck, "buy_item");
		expect(bought.pendingRewards[0]?.cardId).toBe(DAGGER);
		expect(distributeItemAuto({ ...state(), status: "HERO_ACTION" }, DAGGER).heroes[0]?.activeItems.weapon).toBe(DAGGER);
	});

	it("exige a escolha do herói antes de gastar XP para subir de nível", () => {
		const base = state();
		const secondHero: HeroState = {
			...base.heroes[0]!,
			id: "h2",
			cardId: "hero_eternal_rest_cleric",
			impeto: 1,
		};
		const withXp = { ...base, groupXp: 20, heroes: [...base.heroes, secondHero] };

		const withoutTarget = handleSpendXp(withXp, "level_up");
		expect(withoutTarget.groupXp).toBe(20);
		expect(withoutTarget.heroes.map((hero) => hero.impeto)).toEqual([0, 1]);

		const levelled = handleSpendXp(withXp, "level_up", "h2");
		expect(levelled.groupXp).toBe(10);
		expect(levelled.heroes.map((hero) => hero.impeto)).toEqual([0, 2]);
	});
});

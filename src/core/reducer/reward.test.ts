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
	handleSpendXp,
} from "./reward";

const DAGGER = "item_rusty_dagger";

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
});

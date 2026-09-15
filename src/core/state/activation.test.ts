import { describe, expect, it } from "vitest";
import { createEmptyCombatState } from "./combatState";
import { ActivationTracker } from "./activation";
import { createInitialGameState } from "./gameState";
import type { GameState } from "./gameState";
import type { HeroState } from "./heroState";

function state(): GameState {
	const base = createInitialGameState({ heroCardIds: [] });
	return {
		...base,
		heroes: [{ id: "h1", cardId: "hero_crimson_barbarian", maxLife: 10, currentLife: 10, damage: 3, hitBonus: 0, dice: 2, impeto: 0, activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active" as const, playerIndex: 0, xp: 0 } satisfies HeroState],
		combat: createEmptyCombatState(),
	};
}

describe("ActivationTracker", () => {
	it("encerra turno somente uma vez e reconhece herói já agido", () => {
		const initial = state();
		const ended = ActivationTracker.endHeroTurn(initial, "h1");
		expect(ended.combat?.heroesActed).toEqual(["h1"]);
		expect(ActivationTracker.endHeroTurn(ended, "h1")).toBe(ended);
		expect(ActivationTracker.isHeroDisabledThisRound(ended, "h1")).toBe(true);
	});

	it("desabilita por rodada no combate e por jogo fora dele", () => {
		const initial = state();
		const round = ActivationTracker.disable(initial, { kind: "hero", id: "h1", scope: "round", reason: "teste" });
		expect(ActivationTracker.isDisabled(round, "hero", "h1")).toBe(true);
		expect(round.combat?.heroesActed).toEqual(["h1"]);
		const game = ActivationTracker.disable(round, { kind: "item", id: "i1", scope: "game" });
		expect(ActivationTracker.isDisabled(game, "item", "i1")).toBe(true);
		expect(ActivationTracker.hasHeroEffectsDisabled(game, "h1")).toBe(true);
	});

	it("habilita novamente e limpa somente o escopo solicitado", () => {
		const initial = state();
		const locked = ActivationTracker.disable(
			ActivationTracker.disable(initial, { kind: "hero", id: "h1", scope: "round" }),
			{ kind: "item", id: "i1", scope: "game" },
		);
		const cleared = ActivationTracker.clearScope(locked, "round");
		expect(ActivationTracker.isDisabled(cleared, "hero", "h1")).toBe(false);
		expect(ActivationTracker.isDisabled(cleared, "item", "i1")).toBe(true);
		const enabled = ActivationTracker.enable(cleared, "item", "i1");
		expect(ActivationTracker.isDisabled(enabled, "item", "i1")).toBe(false);
		expect(ActivationTracker.clearLocks({ "x": { kind: "card", id: "x", scope: "room" } }, "room")).toEqual({});
	});

	it("não altera estado sem combate ao encerrar ou bloquear por rodada", () => {
		const outside = { ...state(), combat: null };
		expect(ActivationTracker.endHeroTurn(outside, "h1")).toBe(outside);
		expect(ActivationTracker.disableHeroForRound(outside, "h1", "teste")).toBe(outside);
		expect(ActivationTracker.hasHeroEffectsDisabled(outside, "missing")).toBe(true);
	});
});

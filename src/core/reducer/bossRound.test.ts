import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { createInitialGameState } from "../state/gameState";
import { getBossById } from "../data/cards";
import { dungeonAwakeningEffect } from "../rules/dungeonAwakening";
import { createEmptyCombatState } from "../state/combatState";
import { heroesOf, withPendingSkillChoice } from "../state/access";
import { ActivationTracker } from "../state/activation";
import { gameOf, withGame } from "../../engine/state";
import { advanceAfterHeroDisabledForRound, handlePassHeroAction } from "./combat";
import { reducer } from "./index";

function bossTurn() {
	const ids = ["hero_eternal_rest_cleric"];
	const started = reducer(testEngine, createInitialGameState({ heroCardIds: ids }), {
		type: "START_GAME",
		payload: { heroCardIds: ids, seed: 10, deferInitialRoomReveal: true },
	});
	const hero = heroesOf(started)[0]!;
	const state = withGame(started, (game) => ({
		...game,
		status: "BOSS_COMBAT" as const,
		combat: {
			...createEmptyCombatState(),
			phase: "selecting_target" as const,
			selectedHeroId: hero.id,
		},
	}));
	return { state, hero };
}

describe("fechamento de ações no combate de chefe", () => {
	it("a Bruxa causa 4 de dano, ou 5 após o bônus do Despertar", () => {
		const witch = getBossById("boss_great_cauldron_witch");
		expect(witch?.damage).toBe(4);
		expect([0, 1, 2, 3, 4].map((level) =>
			witch!.damage + dungeonAwakeningEffect(level as 0 | 1 | 2 | 3 | 4).damageBonus))
			.toEqual([4, 4, 5, 5, 5]);
	});

	it("última ação do herói não muda BOSS_COMBAT para DIRECT_DAMAGE", () => {
		const { state, hero } = bossTurn();
		const exhausted = ActivationTracker.endHeroTurn(state, hero.id);
		const next = advanceAfterHeroDisabledForRound(exhausted);
		expect(gameOf(next).status).toBe("BOSS_COMBAT");
		expect(gameOf(next).combat?.phase).toBe("selecting_hero");
		expect(gameOf(next).combat?.selectedHeroId).toBeNull();
	});

	it("passar a última ação mantém a máquina na fase correta do chefe", () => {
		const { state, hero } = bossTurn();
		const next = handlePassHeroAction(testEngine, state, hero.id);
		expect(gameOf(next).status).toBe("BOSS_COMBAT");
		expect(gameOf(next).combat?.phase).toBe("selecting_hero");
	});

	it("confirmar escolha de poder no chefe não produz transição inválida", () => {
		const { state, hero } = bossTurn();
		const pending = withPendingSkillChoice(state, {
			skillId: "power_greater_last_light_miracle",
			prompt: "Escolha o efeito",
			options: [{ id: "full_heal", label: "Curar" }],
			sourceHeroId: hero.id, sourceCardId: hero.cardId,
			targetHeroIds: [hero.id],
		});
		const resolved = reducer(testEngine, pending, { type: "SKILL_CHOICE", payload: {
			skillId: "power_greater_last_light_miracle", choice: "full_heal",
		} });
		expect(gameOf(resolved).status).toBe("BOSS_COMBAT");
	});
});

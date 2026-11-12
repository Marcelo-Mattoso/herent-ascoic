import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled } from "@/core/__tests__/fixtures";
import { createInitialGameState } from "@/core/state/gameState";
import { createEmptyCombatState } from "@/core/state/combatState";
import { heroesOf, pendingTriggerInterruptOf } from "@/core/state/access";
import { reducer } from "@/core/reducer";
import { gameOf, withGame } from "@/engine/state";
import { observe } from "./observe";
import { rankMoves } from "./brain";

function moonCombat() {
	const cardId = "hero_green_moon_sorceress";
	const initial = createInitialGameState({ heroCardIds: [cardId] });
	const started = reducer(testEngine, initial, { type: "START_GAME",
		payload: { heroCardIds: [cardId], seed: 7 } });
	const hero = heroesOf(started)[0]!;
	return settled(withGame(started, (game) => ({
		...game, status: "ROLL_DICE" as const,
		activeEnemies: [{
			id: "e1", cardId: "creature_deep_rift_rat",
			maxLife: 30, currentLife: 30, damage: 1, hitBonus: 0, dice: 1,
			tokens: {}, conditions: [], firstDamageTakenThisTurn: false,
			status: "active" as const,
		}],
		combat: { ...createEmptyCombatState(), phase: "resolving" as const,
			pairs: [{ heroId: hero.id, enemyId: "e1" }] },
	})));
}

describe("bot: reações a dados pós-rolagem", () => {
	it("não precisa preparar a Centelha; aceita o modal e rerrola um 1", () => {
		const prepared = reducer(testEngine, moonCombat(), { type: "PREPARE_PHYSICAL_ROLL" });
		const dice = gameOf(prepared).combat!.pendingPhysicalRoll!;
		const rolled = reducer(testEngine, prepared, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: dice.id, heroId: dice.heroId, enemyId: dice.enemyId,
			heroResults: Array(dice.heroDiceCount).fill(1),
			enemyResults: Array(dice.enemyDiceCount).fill(5), source: "physics",
		} });
		expect(pendingTriggerInterruptOf(rolled)?.skillId).toBe("witch_skill_lunar_spark");
		const available = observe(testEngine, rolled);
		expect(available.actions.map((action) => action.type)).toContain("APPLY_TRIGGER_INTERRUPT");
		expect(rankMoves(available)[0]?.type).toBe("APPLY_TRIGGER_INTERRUPT");
		const interrupted = reducer(testEngine, rolled, rankMoves(available)[0]!);
		const selecting = observe(testEngine, interrupted);
		expect(selecting.actions.length).toBeGreaterThan(0);
		expect(selecting.actions.every((action) => action.type === "SELECT_DIE")).toBe(true);
		const selected = reducer(testEngine, interrupted, rankMoves(selecting)[0]!);
		expect(gameOf(selected).combat?.pendingDiceCommit).toBeUndefined();
		expect(gameOf(selected).combat?.lastRoll?.heroResults.some((n) => n >= 1 && n <= 6)).toBe(true);
	});

	it("nunca propõe preparar efeitos de dado que já são solicitados pela engine", () => {
		const combat = moonCombat();
		const state = withGame(combat, (game) => ({ ...game,
			status: "HERO_ACTION", combat: { ...game.combat!, phase: "selecting_hero" } }));
		const actions = rankMoves(observe(testEngine, state));
		expect(actions.some((action) => action.type === "USE_SKILL" &&
			(action.payload.skillId === "witch_skill_lunar_spark" ||
				action.payload.skillId === "witch_power_green_eclipse"))).toBe(false);
	});
});

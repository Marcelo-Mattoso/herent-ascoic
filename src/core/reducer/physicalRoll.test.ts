import { describe, expect, it } from "vitest";
import { createInitialGameState, type GameState } from "../state/gameState";
import { createEmptyCombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import { reducer } from "./index";

const enemy = (id = "e1", hitBonus = 0): EnemyState => ({
	id, cardId: "creature_deep_rift_rat", maxLife: 20, currentLife: 20,
	damage: 2, hitBonus, dice: 1, tokens: {}, conditions: [],
	firstDamageTakenThisTurn: false, status: "active",
});

function readyState(): GameState {
	const base = createInitialGameState({ heroCardIds: ["hero_broken_bastion_warrior"] });
	const started = reducer(base, { type: "START_GAME", payload: { heroCardIds: ["hero_broken_bastion_warrior"] } });
	const hero = started.heroes[0]!;
	return {
		...started, status: "ROLL_DICE", activeEnemies: [enemy()],
		combat: { ...createEmptyCombatState(), phase: "resolving", pairs: [{ heroId: hero.id, enemyId: "e1" }] },
	};
}

describe("rolagem física confirmada pela engine", () => {
	it("valida faces, quantidade, contexto, duplicatas e mantém o RNG para a física", () => {
		const state = reducer(readyState(), { type: "PREPARE_PHYSICAL_ROLL" });
		const pending = state.combat?.pendingPhysicalRoll;
		expect(pending).toBeDefined();
		expect(state.combat?.lastRoll).toBeNull();
		const payload = {
			rollId: pending!.id, heroId: pending!.heroId, enemyId: pending!.enemyId,
			heroResults: Array(pending!.heroDiceCount).fill(4),
			enemyResults: Array(pending!.enemyDiceCount).fill(4),
			source: "physics" as const,
		};
		for (const wrong of [
			{ ...payload, rollId: "old" },
			{ ...payload, heroResults: [0] },
			{ ...payload, heroResults: [7] },
			{ ...payload, heroResults: [1.5] },
			{ ...payload, heroResults: [] },
			{ ...payload, enemyId: "other" },
		]) expect(reducer(state, { type: "CONFIRM_DICE_ROLL", payload: wrong }).combat?.lastRoll).toBeNull();
		const confirmed = reducer(state, { type: "CONFIRM_DICE_ROLL", payload });
		expect(confirmed.combat?.lastRoll?.heroResults).toEqual(payload.heroResults);
		expect(confirmed.combat?.lastRoll?.enemyResults).toEqual(payload.enemyResults);
		expect(confirmed.rng).toEqual(state.rng);
		expect(confirmed.combat?.pendingPhysicalRoll).toBeUndefined();
		expect(reducer(confirmed, { type: "CONFIRM_DICE_ROLL", payload }).combat?.lastRoll).toEqual(confirmed.combat?.lastRoll);
	});

	it("usa o RNG determinístico somente na recuperação", () => {
		const state = reducer(readyState(), { type: "PREPARE_PHYSICAL_ROLL" });
		const pending = state.combat!.pendingPhysicalRoll!;
		const confirmed = reducer(state, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: pending.id, heroId: pending.heroId, enemyId: pending.enemyId,
			heroResults: [...pending.fallbackHeroResults], enemyResults: [...pending.fallbackEnemyResults], source: "fallback",
		} });
		expect(confirmed.combat?.lastRoll?.heroResults).toEqual(pending.fallbackHeroResults);
		expect(confirmed.rng).not.toEqual(state.rng);
	});

	it("calcula o confronto com chefe a partir das faces físicas e preserva os bônus", () => {
		const base = readyState();
		const hero = base.heroes[0]!;
		const boss = { ...enemy("boss", 5), cardId: "boss_azhakar", dice: 3 };
		const state: GameState = {
			...base, status: "BOSS_COMBAT", activeEnemies: [boss],
			combat: { ...base.combat!, pairs: [{ heroId: hero.id, enemyId: boss.id }] },
		};
		const prepared = reducer(state, { type: "PREPARE_PHYSICAL_ROLL" });
		const pending = prepared.combat!.pendingPhysicalRoll!;
		expect(pending.boss).toBe(true);
		const confirmed = reducer(prepared, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: pending.id, heroId: hero.id, enemyId: boss.id,
			heroResults: Array(pending.heroDiceCount).fill(6), enemyResults: [1, 1, 1], source: "physics",
		} });
		const roll = confirmed.combat?.lastRoll;
		expect(roll?.enemyResults).toEqual([1, 1, 1]);
		expect(roll?.enemyTotal).toBe(3 + roll!.enemyBreakdown.reduce((sum, entry) => sum + entry.value, 0));
		expect(roll?.heroTotal).toBe(6 * pending.heroDiceCount + roll!.heroBreakdown.reduce((sum, entry) => sum + entry.value, 0));
	});

	it("reproduz as mesmas faces registradas em uma nova redução", () => {
		const initial = readyState();
		const prepared = reducer(initial, { type: "PREPARE_PHYSICAL_ROLL" });
		const pending = prepared.combat!.pendingPhysicalRoll!;
		const confirmation = { type: "CONFIRM_DICE_ROLL" as const, payload: {
			rollId: pending.id, heroId: pending.heroId, enemyId: pending.enemyId,
			heroResults: Array(pending.heroDiceCount).fill(2), enemyResults: Array(pending.enemyDiceCount).fill(5), source: "physics" as const,
		} };
		const original = reducer(prepared, confirmation);
		const reproduced = reducer(reducer(initial, { type: "PREPARE_PHYSICAL_ROLL" }), confirmation);
		expect(reproduced.combat?.lastRoll).toEqual(original.combat?.lastRoll);
		expect(reproduced.rng).toEqual(original.rng);
	});

	it("registra a face física de um reroll sem gastar RNG e rejeita face inválida", () => {
		const initial = readyState();
		const prepared = reducer(initial, { type: "PREPARE_PHYSICAL_ROLL" });
		const pending = prepared.combat!.pendingPhysicalRoll!;
		const confirmed = reducer(prepared, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: pending.id, heroId: pending.heroId, enemyId: pending.enemyId,
			heroResults: Array(pending.heroDiceCount).fill(1), enemyResults: Array(pending.enemyDiceCount).fill(1), source: "physics",
		} });
		const choosing: GameState = { ...confirmed, combat: { ...confirmed.combat!, pendingDiceSelection: {
			skillId: "test-reroll", heroId: pending.heroId, side: "hero", action: "reroll",
		} } };
		const invalid = reducer(choosing, { type: "SELECT_DIE", payload: { side: "hero", index: 0, value: 7 } });
		expect(invalid.combat?.lastRoll?.heroResults[0]).toBe(1);
		const rerolled = reducer(choosing, { type: "SELECT_DIE", payload: { side: "hero", index: 0, value: 5 } });
		expect(rerolled.combat?.lastRoll?.heroResults[0]).toBe(5);
		expect(rerolled.rng).toEqual(choosing.rng);
		expect(rerolled.eventLog.at(-1)).toContain("alterado de 1 para 5");
	});

	it("prepara e resolve ataque físico de criatura excedente", () => {
		const base = readyState();
		const hero = base.heroes[0]!;
		const state: GameState = {
			...base, status: "DIRECT_DAMAGE", activeEnemies: [enemy(), enemy("e2", 100)],
			combat: { ...base.combat!, pairs: [{ heroId: hero.id, enemyId: "e1" }] },
		};
		const prepared = reducer(state, { type: "PREPARE_EXTRA_ATTACK" });
		const pending = prepared.combat?.pendingPhysicalRoll;
		expect(pending?.extraAttack).toBe(true);
		const confirmed = reducer(prepared, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: pending!.id, heroId: pending!.heroId, enemyId: pending!.enemyId,
			heroResults: Array(pending!.heroDiceCount).fill(1),
			enemyResults: Array(pending!.enemyDiceCount).fill(6), source: "physics",
		} });
		expect(confirmed.combat?.lastRoll?.extraAttack).toBe(true);
		const resolved = reducer(confirmed, { type: "RESOLVE_ATTACK" });
		expect(resolved.status).toBe("DIRECT_DAMAGE");
		expect(resolved.extraAttackFeedback?.at(-1)?.enemyId).toBe("e2");
		expect(resolved.heroes[0]!.currentLife).toBeLessThan(hero.currentLife);
		expect(reducer(resolved, { type: "PREPARE_EXTRA_ATTACK" }).status).toBe("CHECK_COMBAT_END");
	});
});

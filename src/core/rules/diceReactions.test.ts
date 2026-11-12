import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { settled } from "../__tests__/fixtures";
import { createInitialGameState, type GameState } from "../state/gameState";
import { createEmptyCombatState, type CombatRollResult } from "../state/combatState";
import { heroesOf, pendingTriggerInterruptOf, pendingSkillChoiceOf } from "../state/access";
import { skillById } from "../gameEngine";
import { guardPassed } from "../triggers/engine";
import { reducer } from "../reducer";
import { gameOf, withGame } from "../../engine/state";
import { canChangeRolledDice, hasDiceChangeEffect } from "./diceReactions";
import { legalActions } from "../legalActions";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "../skills/dsl/evaluate";
import { drainStack } from "../effects/resolver";

const MOON = "hero_green_moon_sorceress";
const SPARK = "witch_skill_lunar_spark";
const STAFF = "item_crimson_rune_staff";
const HAMMER = "artifact_lost_forge_hammer";

function ready(heroCardId: string, options: { boss?: boolean; extra?: boolean; item?: boolean; artifact?: boolean } = {}) {
	const started = reducer(testEngine, createInitialGameState({ heroCardIds: [heroCardId] }), {
		type: "START_GAME", payload: { heroCardIds: [heroCardId], seed: 42 },
	});
	const hero = heroesOf(started)[0]!;
	const targetId = options.boss ? "boss" : options.extra ? "extra" : "e1";
	const status = options.boss ? "BOSS_COMBAT" : options.extra ? "DIRECT_DAMAGE" : "ROLL_DICE";
	const enemy = (id: string) => ({
		id, cardId: id === "boss" ? "boss_azhakar" : "creature_deep_rift_rat",
		maxLife: 30, currentLife: 30, damage: 2, hitBonus: 0, dice: id === "boss" ? 3 : 1,
		tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active" as const,
	});
	const state: GameState = settled(withGame(started, (game) => ({
		...game, status,
		heroes: options.item ? [{ ...hero, activeItems: { ...hero.activeItems, hand1: STAFF } }] : game.heroes,
		groupArtifacts: options.artifact ? [{ cardId: HAMMER, carriedBy: null }] : [],
		activeEnemies: options.extra ? [enemy("e1"), enemy(targetId)] : [enemy(targetId)],
		combat: {
			...createEmptyCombatState(), phase: options.extra ? "direct_damage" as const : "resolving" as const,
			pairs: [{ heroId: hero.id, enemyId: options.extra ? "e1" : targetId }],
		},
	})));
	return { state, heroId: hero.id };
}

function rollWithFaces(state: GameState, heroValue: number, enemyValue = 4) {
	const type = gameOf(state).status === "DIRECT_DAMAGE" ? "PREPARE_EXTRA_ATTACK" : "PREPARE_PHYSICAL_ROLL";
	const prepared = reducer(testEngine, state, { type });
	const pending = gameOf(prepared).combat!.pendingPhysicalRoll!;
	expect(pending).toBeDefined();
	return reducer(testEngine, prepared, { type: "CONFIRM_DICE_ROLL", payload: {
		rollId: pending.id, heroId: pending.heroId, enemyId: pending.enemyId,
		heroResults: Array(pending.heroDiceCount).fill(heroValue),
		enemyResults: Array(pending.enemyDiceCount).fill(enemyValue),
		source: "physics",
	} });
}

describe("reações a dados: elegibilidade central", () => {
	const roll: CombatRollResult = {
		heroId: "h1", enemyId: "e1",
		heroResults: [1, 5], enemyResults: [3],
		heroTotal: 6, enemyTotal: 3, heroBreakdown: [], enemyBreakdown: [],
	};
	it("i_modify_die oferece somente faces diferentes dentro do limite e recalcula o resultado", () => {
		const { state, heroId } = ready("hero_eternal_rest_cleric");
		const rolled = rollWithFaces(state, 4);
		const ctx = buildScriptCtx(testEngine, rolled, {
			triggeredBy: "manual", skillId: "dice_modifier_test",
			sourceHeroId: heroId, targetHeroIds: [heroId],
		}, {});
		const modified = drainStack(testEngine,
			evaluate([{ kind: "i_modify_die", die_side: "hero", delta: 2 }], ctx));
		expect(gameOf(modified).combat?.pendingDiceSelection?.deltaMax).toBe(2);
		const noOp = reducer(testEngine, modified, {
			type: "SELECT_DIE", payload: { side: "hero", index: 0, value: 4 },
		});
		expect(gameOf(noOp).combat?.pendingDiceSelection).toBeDefined();
		const changed = reducer(testEngine, modified, {
			type: "SELECT_DIE", payload: { side: "hero", index: 0, value: 6 },
		});
		expect(gameOf(changed).combat?.lastRoll?.heroResults[0]).toBe(6);
		expect(gameOf(changed).combat?.pendingDiceSelection).toBeUndefined();
	});

	it("detecta dados elegíveis no lado correto e em efeitos aninhados", () => {
		const lunar = [{ kind: "i_reroll" as const, die_side: "hero" as const, only_if_value: 1 }];
		expect(hasDiceChangeEffect(lunar)).toBe(true);
		expect(canChangeRolledDice(lunar, roll)).toBe(true);
		expect(canChangeRolledDice(lunar, { ...roll, heroResults: [2, 5] })).toBe(false);
		expect(canChangeRolledDice([{ kind: "i_reroll", die_side: "enemy", only_if_value: 1 }], roll)).toBe(false);
		expect(canChangeRolledDice([{ kind: "i_set_die", die_side: "enemy", value: 1 }], roll)).toBe(true);
		expect(canChangeRolledDice([{ kind: "i_modify_die", die_side: "hero", delta: 2 }], roll)).toBe(true);
		expect(canChangeRolledDice([{ kind: "i_modify_die", die_side: "hero", delta: 0 }], roll)).toBe(false);
		expect(canChangeRolledDice([{
			kind: "i_choose_one", options: [
				{ id: "hero_six", effect: [{ kind: "i_set_die", die_side: "hero", value: 6 }] },
				{ id: "enemy_one", effect: [{ kind: "i_set_die", die_side: "enemy", value: 1 }] },
			],
		}], roll)).toBe(true);
	});
});

describe("Centelha da Lua Verde: modal, dados e cargas", () => {
	it("pergunta depois do resultado 1; ignorar não consome a carga", () => {
		const { state, heroId } = ready(MOON);
		const rolled = rollWithFaces(state, 1);
		expect(gameOf(rolled).combat?.lastRoll?.heroResults).toContain(1);
		expect(pendingTriggerInterruptOf(rolled)?.skillId).toBe(SPARK);
		const pending = pendingTriggerInterruptOf(rolled)!;
		const skipped = reducer(testEngine, rolled, {
			type: "SKIP_TRIGGER_INTERRUPT", payload: { interruptId: pending.id },
		});
		expect(guardPassed(skipped, skillById(testEngine, SPARK)!, heroId)).toBe(true);
		expect(gameOf(skipped).combat?.pendingDiceSelection).toBeUndefined();
	});

	it("exibe SELECT_DIE como ação legal do core; impede resolver o ataque antes da decisão", () => {
		const { state } = ready(MOON);
		const rolled = rollWithFaces(state, 1);
		const interrupt = pendingTriggerInterruptOf(rolled)!;
		const accepted = reducer(testEngine, rolled, {
			type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: interrupt.id },
		});
		const legal = legalActions(testEngine, accepted);
		expect(legal.some((action) => action.type === "SELECT_DIE")).toBe(true);
		expect(legal.some((action) => action.type === "RESOLVE_ATTACK")).toBe(false);
		const ignored = reducer(testEngine, accepted, { type: "RESOLVE_ATTACK" });
		expect(gameOf(ignored).combat?.pendingDiceSelection).toBeDefined();
		const result = reducer(testEngine, accepted,
			legal.find((action) => action.type === "SELECT_DIE")!);
		expect(gameOf(result).combat?.pendingDiceSelection).toBeUndefined();
	});

	it("só marca uso após escolher um dado válido, recalcula total e não duplica gatilho", () => {
		const { state, heroId } = ready(MOON);
		const rolled = rollWithFaces(state, 1);
		const interrupt = pendingTriggerInterruptOf(rolled)!;
		const applied = reducer(testEngine, rolled, {
			type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: interrupt.id },
		});
		expect(gameOf(applied).combat?.pendingDiceSelection).toMatchObject({
			skillId: SPARK, side: "hero", action: "reroll", filter: { value: 1 },
		});
		expect(guardPassed(applied, skillById(testEngine, SPARK)!, heroId)).toBe(true);
		const invalid = reducer(testEngine, applied, {
			type: "SELECT_DIE", payload: { side: "enemy", index: 0, value: 6 },
		});
		expect(gameOf(invalid).combat?.pendingDiceSelection).toBeDefined();
		expect(guardPassed(invalid, skillById(testEngine, SPARK)!, heroId)).toBe(true);
		const confirmed = reducer(testEngine, applied, {
			type: "SELECT_DIE", payload: { side: "hero", index: 0, value: 6 },
		});
		expect(gameOf(confirmed).combat?.lastRoll?.heroResults[0]).toBe(6);
		expect(gameOf(confirmed).combat?.lastRoll?.heroTotal).toBeGreaterThan(gameOf(rolled).combat!.lastRoll!.heroTotal);
		expect(guardPassed(confirmed, skillById(testEngine, SPARK)!, heroId)).toBe(false);
		expect(gameOf(confirmed).combat?.pendingDiceCommit).toBeUndefined();
	});

	it("não oferece Centelha quando nenhum dado aliado mostra 1", () => {
		const { state } = ready(MOON);
		const rolled = rollWithFaces(state, 4);
		expect(pendingTriggerInterruptOf(rolled)?.skillId).not.toBe(SPARK);
		expect(gameOf(rolled).combat?.pendingDiceSelection).toBeUndefined();
	});

	it("abre Centelha também no combate físico contra o chefe", () => {
		const { state } = ready(MOON, { boss: true });
		const rolled = rollWithFaces(state, 1);
		expect(pendingTriggerInterruptOf(rolled)?.skillId).toBe(SPARK);
	});

	it("oferece reação ao herói defensor de um ataque excedente", () => {
		const { state } = ready(MOON, { extra: true });
		const rolled = rollWithFaces(state, 1);
		expect(gameOf(rolled).combat?.lastRoll?.extraAttack).toBe(true);
		expect(pendingTriggerInterruptOf(rolled)?.skillId).toBe(SPARK);
	});

	it("usa a mesma decisão para Runa Menor equipada", () => {
		const { state } = ready("hero_eternal_rest_cleric", { item: true });
		const rolled = rollWithFaces(state, 1);
		expect(pendingTriggerInterruptOf(rolled)?.skillId).toBe("skill_minor_rune");
	});

	it("artefato sem portador pode fixar um dado e consome a carga só após escolher a face", () => {
		const { state } = ready("hero_eternal_rest_cleric", { artifact: true });
		const rolled = rollWithFaces(state, 2, 5);
		const interrupt = pendingTriggerInterruptOf(rolled)!;
		expect(interrupt.skillId).toBe("power_supreme_rift_rune");
		const prompted = reducer(testEngine, rolled, {
			type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: interrupt.id },
		});
		expect(pendingSkillChoiceOf(prompted)?.skillId).toBe("power_supreme_rift_rune");
		const selected = reducer(testEngine, prompted, { type: "SKILL_CHOICE", payload: {
			skillId: "power_supreme_rift_rune", choice: "ally_six",
		} });
		expect(gameOf(selected).combat?.pendingDiceSelection).toMatchObject({
			action: "set_to", side: "hero", setToValue: 6,
		});
		const confirmed = reducer(testEngine, selected, {
			type: "SELECT_DIE", payload: { side: "hero", index: 0 },
		});
		expect(gameOf(confirmed).combat?.lastRoll?.heroResults[0]).toBe(6);
		expect(gameOf(confirmed).combat?.pendingDiceCommit).toBeUndefined();
	});
});

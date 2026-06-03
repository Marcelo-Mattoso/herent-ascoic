// Testes de aceite Lote 3 (Patch-12 Fase 5) — DSL choose_one.

import { describe, expect, it } from "vitest";
import { getModifierTotal } from "../../../ecs/world";
import { reducer } from "../../../reducer";
import { buildScriptCtx } from "../../../scripts/context";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { evaluate } from "../evaluate";
import "../../handlers/index";

const CFG = { heroCardIds: [] };

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
			maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function stateWithCombat(extra: Partial<GameState> = {}): GameState {
	return {
		...createInitialGameState(CFG),
		heroes: [makeHero()],
		combat: createEmptyCombatState(),
		...extra,
	};
}

function dispatchChoice(
	state: GameState,
	skillId: string,
	choice: string,
): GameState {
	return reducer(state, { type: "SKILL_CHOICE", payload: { skillId, choice } });
}

// ── choose_one: abre pendingSkillChoice + SKILL_CHOICE avalia ramo correto ────

describe("choose_one — fluxo completo", () => {
	it("grava ramos de effect no pendingSkillChoice", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "test_skill" },
			{},
		);
		const result = evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{
							id: "heal",
							effect: [{ kind: "i_heal", to: "$source", amount: 3 }],
						},
						{
							id: "damage_bonus",
							effect: [
								{
									kind: "p_modifier",
									to: "$source",
									stat: "s_damage_dealt",
									operation: "add",
									value: 2,
									duration: { kind: "once" },
								},
							],
						},
					],
				},
			],
			ctx,
		);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options).toHaveLength(2);
		expect(result.pendingSkillChoice?.options[0]?.effect).toBeDefined();
	});

	it("SKILL_CHOICE avalia o ramo 'curar'", () => {
		const hero = makeHero({ currentLife: 5 });
		const state = stateWithCombat({ heroes: [hero] });
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "test_skill", sourceHeroId: "h1" },
			{},
		);
		const withChoice = evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{
							id: "heal",
							effect: [{ kind: "i_heal", to: "$source", amount: 3 }],
						},
						{
							id: "damage_bonus",
							effect: [
								{
									kind: "p_modifier",
									to: "$source",
									stat: "s_damage_dealt",
									operation: "add",
									value: 2,
									duration: { kind: "once" },
								},
							],
						},
					],
				},
			],
			ctx,
		);
		const result = dispatchChoice(withChoice, "test_skill", "heal");
		expect(result.heroes[0].currentLife).toBe(8);
		expect(result.pendingSkillChoice).toBeUndefined();
	});

	it("SKILL_CHOICE avalia o ramo 'dano'", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", skillId: "test_skill", sourceHeroId: "h1" },
			{},
		);
		const withChoice = evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{
							id: "heal",
							effect: [{ kind: "i_heal", to: "$source", amount: 3 }],
						},
						{
							id: "damage_bonus",
							effect: [
								{
									kind: "p_modifier",
									to: "$source",
									stat: "s_damage_dealt",
									operation: "add",
									value: 2,
									duration: { kind: "once" },
								},
							],
						},
					],
				},
			],
			ctx,
		);
		const result = dispatchChoice(withChoice, "test_skill", "damage_bonus");
		// Patch-18 Lote G: damage_bonus → damage_dealt no ECS world
		expect(getModifierTotal(result.world, "h1", "damage_dealt")).toBe(2);
		expect(result.pendingSkillChoice).toBeUndefined();
	});
});

// ── power_greater_last_light_miracle: full_heal ou survive ───────────────────

describe("power_greater_last_light_miracle — choose_one", () => {
	it("escolher 'curar totalmente' restaura vida ao máximo", () => {
		const hero = makeHero({ currentLife: 2 });
		const state = stateWithCombat({ heroes: [hero] });
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "on_use",
				skillId: "power_greater_last_light_miracle",
				sourceHeroId: "h1",
				targetHeroIds: ["h1"],
			},
			{},
		);
		const withChoice = evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{
							id: "full_heal",
							effect: [{ kind: "i_full_heal", to: "$target" }],
						},
						{
							id: "survive",
							effect: [{ kind: "i_prevent_destroy", to: "$target" }],
						},
					],
				},
			],
			ctx,
		);
		const result = dispatchChoice(
			withChoice,
			"power_greater_last_light_miracle",
			"full_heal",
		);
		expect(result.heroes[0].currentLife).toBe(10);
	});
});

// ── power_last_light_oath: for_each all_heroes heal ──────────────────────────

describe("power_last_light_oath — for_each heal", () => {
	it("heal 5 cura todos os heróis", () => {
		const h1 = makeHero({ id: "h1", currentLife: 3 });
		const h2 = makeHero({ id: "h2", currentLife: 5 });
		const base = createInitialGameState(CFG);
		const state: GameState = {
			...base,
			heroes: [h1, h2],
			combat: createEmptyCombatState(),
		};
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "on_use",
				skillId: "power_last_light_oath",
				sourceHeroId: "h1",
			},
			{},
		);
		const withChoice = evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{
							id: "heal_all",
							effect: [
								{
									kind: "i_for_each",
									over: "all_heroes",
									as: "$h",
									do: [{ kind: "i_heal", to: "$target", amount: 5 }],
								},
							],
						},
						{
							id: "damage_bonus_holy",
							effect: [
								{
									kind: "p_modifier",
									to: "$source",
									stat: "s_damage_dealt",
									operation: "add",
									value: 5,
									duration: { kind: "once" },
								},
							],
						},
					],
				},
			],
			ctx,
		);
		const result = dispatchChoice(
			withChoice,
			"power_last_light_oath",
			"heal_all",
		);
		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(8);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(10);
	});
});


// Testes de aceite Lote 3 (Patch-12 Fase 5) — DSL choose_one.

import { describe, expect, it } from "vitest";
import { reducer } from "../../../reducer";
import { buildScriptCtx } from "../../../scripts/context";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { evaluate } from "../evaluate";
import "../../handlers/index";

const CFG = { heroCardNames: ["Herói Teste"] };

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		cardName: "Herói Teste",
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
					kind: "choose_one",
					options: [
						{
							label: "Curar 3",
							effect: [{ kind: "apply_heal", to: "$source", amount: 3 }],
						},
						{
							label: "+2 dano",
							effect: [
								{
									kind: "add_modifier",
									to: "$source",
									stat: "damage_bonus",
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
					kind: "choose_one",
					options: [
						{
							label: "Curar 3",
							effect: [{ kind: "apply_heal", to: "$source", amount: 3 }],
						},
						{
							label: "+2 dano",
							effect: [
								{
									kind: "add_modifier",
									to: "$source",
									stat: "damage_bonus",
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
		const result = dispatchChoice(withChoice, "test_skill", "Curar 3");
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
					kind: "choose_one",
					options: [
						{
							label: "Curar 3",
							effect: [{ kind: "apply_heal", to: "$source", amount: 3 }],
						},
						{
							label: "+2 dano",
							effect: [
								{
									kind: "add_modifier",
									to: "$source",
									stat: "damage_bonus",
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
		const result = dispatchChoice(withChoice, "test_skill", "+2 dano");
		const entries = result.combat?.bonusNextAttack?.["h1"] ?? [];
		expect(entries.some((e) => e.value === 2)).toBe(true);
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
					kind: "choose_one",
					options: [
						{
							label: "Curar totalmente",
							effect: [{ kind: "apply_full_heal", to: "$target" }],
						},
						{
							label: "Sobreviver com 1 vida",
							effect: [{ kind: "prevent_destroy", to: "$target" }],
						},
					],
				},
			],
			ctx,
		);
		const result = dispatchChoice(
			withChoice,
			"power_greater_last_light_miracle",
			"Curar totalmente",
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
					kind: "choose_one",
					options: [
						{
							label: "Curar todos (5)",
							effect: [
								{
									kind: "for_each",
									over: "all_heroes",
									as: "$h",
									do: [{ kind: "apply_heal", to: "$target", amount: 5 }],
								},
							],
						},
						{
							label: "+5 dano sagrado",
							effect: [
								{
									kind: "add_modifier",
									to: "$source",
									stat: "damage_bonus",
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
			"Curar todos (5)",
		);
		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(8);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(10);
	});
});

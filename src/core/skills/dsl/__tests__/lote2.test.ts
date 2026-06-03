// Testes de aceite Lote 2 (Patch-12 Fase 4) — DSL com add_modifier.

import { describe, expect, it } from "vitest";
import type { ModifierComponent } from "../../../ecs/types";
import { getComponents, getModifierTotal } from "../../../ecs/world";
import { drainStack } from "../../../effects/resolver";
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

// ── add_modifier stat:"s_damage_dealt" → ECS world (patch-18 Lote G) ──────────

describe("add_modifier damage_bonus → bonusNextAttack", () => {
	it("adiciona bônus ao herói-fonte após drainStack", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "combat", sourceHeroId: "h1" },
			{ value: 2 },
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_damage_dealt",
						operation: "add",
						value: "$value",
						duration: { kind: "until_end_of_combat" },
					},
				],
				ctx,
			),
		);
		expect(getModifierTotal(result.world, "h1", "damage_dealt")).toBe(2);
	});
});

// ── add_modifier stat:"s_hit_bonus" → ECS world ──────────────────────────────

describe("add_modifier tohit_bonus → bonusNextAttack", () => {
	it("adiciona bônus de acerto ao inimigo-fonte", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "combat_if_alone_in_room", sourceEnemyId: "e1" },
			{ value: 1 },
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_hit_bonus",
						operation: "add",
						value: "$value",
						duration: { kind: "until_end_of_combat" },
					},
				],
				ctx,
			),
		);
		expect(getModifierTotal(result.world, "e1", "hit_bonus")).toBe(1);
	});
});

// ── add_modifier stat:"s_damage_reduction" → ECS world ─────────────────────────

describe("add_modifier damage_reduction → damageReduction", () => {
	it("adiciona redução de dano ao herói após drainStack", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_take_damage", sourceHeroId: "h1" },
			{ value: 3 },
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_damage_reduction",
						operation: "add",
						value: "$value",
						duration: { kind: "while_in_play" },
					},
				],
				ctx,
			),
		);
		// damage_reduction → damage_taken ECS com valor negativo
		expect(getModifierTotal(result.world, "h1", "damage_taken")).toBe(-3);
	});
});

// ── add_modifier stat:"s_purple_damage_reduction" → flags (fix bug) ────────────

describe("add_modifier purple_damage_reduction — skill_last_light_ward (bug fix)", () => {
	it("armazena valor numérico correto nas flags (não boolean)", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_purple_effect_damage_taken", sourceHeroId: "h1" },
			{ value: 2 },
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_purple_damage_reduction",
						operation: "add",
						value: "$value",
						duration: { kind: "while_in_play" },
					},
				],
				ctx,
			),
		);
		expect(result.flags["purpleDmgReduction::h1"]).toBe(2);
	});

	it("acumula corretamente em múltiplas aplicações", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_take_damage", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const r1 = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_purple_damage_reduction",
						operation: "add",
						value: 1,
						duration: { kind: "while_in_play" },
					},
				],
				ctx,
			),
		);
		const ctx2 = buildScriptCtx(
			r1,
			{ triggeredBy: "on_take_damage", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const r2 = drainStack(
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_purple_damage_reduction",
						operation: "add",
						value: 1,
						duration: { kind: "while_in_play" },
					},
				],
				ctx2,
			),
		);
		expect(r2.flags["purpleDmgReduction::h1"]).toBe(2);
	});
});

// ── for_each + add_modifier: power_unbreakable_bastion_guard ─────────────────

describe("for_each + add_modifier — power_unbreakable_bastion_guard", () => {
	it("aplica damage_reduction a todos os heróis ativos", () => {
		const base = createInitialGameState(CFG);
		const state: GameState = {
			...base,
			heroes: [makeHero({ id: "h1" }), makeHero({ id: "h2" })],
			combat: createEmptyCombatState(),
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(
			evaluate(
				[
					{
						kind: "i_for_each",
						over: "all_heroes",
						as: "$loopHero",
						do: [
							{
								kind: "p_modifier",
								to: "$target",
								stat: "s_damage_reduction",
								operation: "add",
								value: 1,
								duration: { kind: "until_end_of_round" },
							},
						],
					},
				],
				ctx,
			),
		);
		// damage_reduction → damage_taken ECS com valor negativo
		expect(getModifierTotal(result.world, "h1", "damage_taken")).toBe(-1);
		expect(getModifierTotal(result.world, "h2", "damage_taken")).toBe(-1);
	});
});


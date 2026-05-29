// Testes de aceite Lote 2 (Patch-12 Fase 4) — DSL com add_modifier.

import { describe, expect, it } from "vitest";
import { drainStack } from "../../../effects/resolver";
import { evaluate } from "../evaluate";
import { buildScriptCtx } from "../../../scripts/context";
import { createInitialGameState } from "../../../state/gameState";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import "../../handlers/index";

const CFG = { heroCardNames: ["Herói Teste"] };

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1", cardName: "Herói Teste", maxLife: 10, currentLife: 10,
		damage: 3, hitBonus: 0, dice: 2, impeto: 0, activeItems: {}, backpack: [],
		usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0, ...overrides,
	};
}

function stateWithCombat(extra: Partial<GameState> = {}): GameState {
	return { ...createInitialGameState(CFG), heroes: [makeHero()], combat: createEmptyCombatState(), ...extra };
}

// ── add_modifier stat:"damage_bonus" → combat.bonusNextAttack ────────────────

describe("add_modifier damage_bonus → bonusNextAttack", () => {
	it("adiciona bônus ao herói-fonte após drainStack", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(state, { triggeredBy: "combat", sourceHeroId: "h1" }, { value: 2 });
		const result = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "damage_bonus",
			operation: "add", value: "$value", duration: { kind: "until_end_of_combat" },
		}], ctx));
		const entries = result.combat?.bonusNextAttack?.["h1"] ?? [];
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.some((e) => e.value === 2)).toBe(true);
	});
});

// ── add_modifier stat:"tohit_bonus" → bonusNextAttack ────────────────────────

describe("add_modifier tohit_bonus → bonusNextAttack", () => {
	it("adiciona bônus de acerto ao inimigo-fonte", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(state,
			{ triggeredBy: "combat_if_alone_in_room", sourceEnemyId: "e1" }, { value: 1 });
		const result = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "tohit_bonus",
			operation: "add", value: "$value", duration: { kind: "until_end_of_combat" },
		}], ctx));
		const entries = result.combat?.bonusNextAttack?.["e1"] ?? [];
		expect(entries.some((e) => e.value === 1)).toBe(true);
	});
});

// ── add_modifier stat:"damage_reduction" → combat.damageReduction ───────────

describe("add_modifier damage_reduction → damageReduction", () => {
	it("adiciona redução de dano ao herói após drainStack", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(state, { triggeredBy: "on_take_damage", sourceHeroId: "h1" }, { value: 3 });
		const result = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "damage_reduction",
			operation: "add", value: "$value", duration: { kind: "while_in_play" },
		}], ctx));
		expect(result.combat?.damageReduction?.["h1"]).toBe(3);
	});
});

// ── add_modifier stat:"purple_damage_reduction" → flags (fix bug) ────────────

describe("add_modifier purple_damage_reduction — skill_last_light_ward (bug fix)", () => {
	it("armazena valor numérico correto nas flags (não boolean)", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(state, { triggeredBy: "on_purple_effect_damage_taken", sourceHeroId: "h1" }, { value: 2 });
		const result = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "purple_damage_reduction",
			operation: "add", value: "$value", duration: { kind: "while_in_play" },
		}], ctx));
		expect(result.flags["purpleDmgReduction::h1"]).toBe(2);
	});

	it("acumula corretamente em múltiplas aplicações", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(state, { triggeredBy: "on_take_damage", sourceHeroId: "h1" }, { value: 1 });
		const r1 = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "purple_damage_reduction",
			operation: "add", value: 1, duration: { kind: "while_in_play" },
		}], ctx));
		const ctx2 = buildScriptCtx(r1, { triggeredBy: "on_take_damage", sourceHeroId: "h1" }, { value: 1 });
		const r2 = drainStack(evaluate([{
			kind: "add_modifier", to: "$source", stat: "purple_damage_reduction",
			operation: "add", value: 1, duration: { kind: "while_in_play" },
		}], ctx2));
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
		const ctx = buildScriptCtx(state, { triggeredBy: "on_use", sourceHeroId: "h1" }, { value: 1 });
		const result = drainStack(evaluate([{
			kind: "for_each", over: "all_heroes", as: "$loopHero",
			do: [{ kind: "add_modifier", to: "$target", stat: "damage_reduction", operation: "add", value: 1, duration: { kind: "until_end_of_round" } }],
		}], ctx));
		expect(result.combat?.damageReduction?.["h1"]).toBe(1);
		expect(result.combat?.damageReduction?.["h2"]).toBe(1);
	});
});

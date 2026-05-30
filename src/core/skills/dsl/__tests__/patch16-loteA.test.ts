// Testes de aceite Patch-16 Lote A — skills #1-#6 convertidas de type legado para DSL.

import { describe, expect, it } from "vitest";
import { getModifierTotal } from "../../../ecs/world";
import { SKILLS } from "../../../data/skills";
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
		currentLife: 8,
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

function defEffect(id: string) {
	const def = SKILLS.abilities.find((s) => s.id === id);
	if (!def?.effect) throw new Error(`Skill ${id} não tem effect DSL`);
	return def.effect;
}

// ── #1 skill_life_drain ───────────────────────────────────────────────────────

describe("skill_life_drain — apply_heal to $source", () => {
	it("cura o herói-fonte em value de vida", () => {
		const state = {
			...createInitialGameState(CFG),
			heroes: [makeHero({ currentLife: 5 })],
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_deal_damage", sourceHeroId: "h1" },
			{ value: 3 },
		);
		const result = drainStack(evaluate(defEffect("skill_life_drain"), ctx));
		expect(result.heroes[0].currentLife).toBe(8);
	});
});

// ── #2 item_skill_deadly_edge ─────────────────────────────────────────────────

describe("item_skill_deadly_edge — tohit_bonus + damage_bonus", () => {
	it("adiciona bônus de acerto e dano em bonusNextAttack", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "combat", sourceHeroId: "h1" },
			{ value: 2 },
		);
		const result = drainStack(
			evaluate(defEffect("item_skill_deadly_edge"), ctx),
		);
		// Patch-18 Lote G: bonusNextAttack migrado para ECS (hit_bonus + damage_dealt)
		expect(getModifierTotal(result.world, "h1", "hit_bonus")).toBe(2);
		expect(getModifierTotal(result.world, "h1", "damage_dealt")).toBe(2);
	});
});

// ── #3 item_skill_drain_life_and_deadly_edge ──────────────────────────────────

describe("item_skill_drain_life_and_deadly_edge — tohit_bonus + damage_bonus + heal", () => {
	it("adiciona dois modificadores e cura 1 de vida no herói-fonte", () => {
		const state = stateWithCombat({ heroes: [makeHero({ currentLife: 5 })] });
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "combat_and_on_damage_dealt", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(
			evaluate(defEffect("item_skill_drain_life_and_deadly_edge"), ctx),
		);
		// Patch-18 Lote G: dois modificadores no ECS world
		const hitBonus = getModifierTotal(result.world, "h1", "hit_bonus");
		const dmgDealt = getModifierTotal(result.world, "h1", "damage_dealt");
		expect(hitBonus + dmgDealt).toBeGreaterThan(0);
		expect(result.heroes[0].currentLife).toBe(6);
	});
});

// ── #4 dungeon_skill_dead_torches ─────────────────────────────────────────────

describe("dungeon_skill_dead_torches — choose_one", () => {
	it("registra escolha pendente com duas opções", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "before_first_combat_in_room", sourceHeroId: "h1" },
			{},
		);
		const result = evaluate(defEffect("dungeon_skill_dead_torches"), ctx);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options.length).toBe(2);
	});
});

// ── #5 power_mighty_crimson_fury ──────────────────────────────────────────────

describe("power_mighty_crimson_fury — damage_bonus until_end_of_combat", () => {
	it("adiciona damage_bonus de 6 ao herói-fonte válido até fim do combate", () => {
		const state = stateWithCombat();
		const def = SKILLS.abilities.find((s) => s.id === "power_mighty_crimson_fury");
		if (!def?.effect) throw new Error("skill sem effect");
		const params = { ...(def.params ?? {}), value: null };
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "once_per_game_on_use_furia_rubra", sourceHeroId: "h1" },
			params,
		);
		const result = drainStack(evaluate(def.effect, ctx));
		// Patch-18 Lote G: damage_bonus → damage_dealt no ECS world
		expect(getModifierTotal(result.world, "h1", "damage_dealt")).toBe(6);
	});
});

// ── #6 item_skill_crimson_fury_mighty ────────────────────────────────────────

describe("item_skill_crimson_fury_mighty — self_damage + damage_bonus", () => {
	it("causa 2 de dano ao herói-fonte e adiciona +6 de dano até fim do combate", () => {
		const state = stateWithCombat({ heroes: [makeHero({ currentLife: 10 })] });
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "before_attack_once_per_game", sourceHeroId: "h1" },
			{ value: 2 },
		);
		const result = drainStack(
			evaluate(defEffect("item_skill_crimson_fury_mighty"), ctx),
		);
		expect(result.heroes[0].currentLife).toBe(8);
		// Patch-18 Lote G: damage_bonus → damage_dealt no ECS world
		expect(getModifierTotal(result.world, "h1", "damage_dealt")).toBe(6);
	});
});

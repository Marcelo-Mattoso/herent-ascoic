import { describe, expect, it } from "vitest";
import type { ModifierComponent } from "../../ecs/types";
import { getComponents } from "../../ecs/world";
import { drainStack } from "../../effects/resolver";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { buildScriptCtx } from "../context";
import { scriptOf } from "@/core/gameEngine";

// Importar scripts para registrá-los
// skill_rift_rune, power_supreme_rift_rune, power_hunter_execution migrados para DSL (patch-21 Lote F)
import "../../../data/scripts/skill_focus_deflection";
import "../../../data/scripts/skill_opportunity_shot";
import "../../../data/scripts/skill_rekindled_forge";
import "../../../data/scripts/dungeon_skill_rekindled_forge";
import "../../../data/scripts/skill_rift_evasion";
import "../../../data/scripts/dungeon_skill_summon_guardian";
import "../../../data/scripts/power_deep_veil_echo";
import "../../skills/handlers/index"; // registra continuações legadas

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

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardId: "creature_dark_cave_goblin",
		maxLife: 4,
		currentLife: 4,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function baseState(extra: Partial<LooseGame> = {}): GameState {
	return settledWith(createInitialGameState(CFG), {
		heroes: [makeHero()],
		combat: createEmptyCombatState(),
		...extra,
	});
}

function runScript(
	id: string,
	ctx: ReturnType<typeof buildScriptCtx>,
): GameState {
	const fn = scriptOf(testEngine, `${id}.run`);
	if (!fn) throw new Error(`Script ${id} não registrado`);
	return fn(ctx);
}

// ── #21 skill_rift_rune — migrado para DSL i_modify_die (patch-21 Lote F) ─────

import { evaluate } from "../../skills/dsl/evaluate";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, enemiesOf, withDecks } from "@/core/state/access";
import { settledWith, type LooseGame } from "../../__tests__/fixtures";
import {
	pendingSkillChoiceOf,
	scopedCountOf,
	scopedFlagOf,
	withScopedCount,
	withScopedFlag,
} from "../../state/access";
import { gameOf } from "../../../engine/state";

describe("skill_rift_rune — i_modify_die (patch-21 Lote F)", () => {
	it("define pendingDiceSelection para herói-fonte com lastRoll presente", () => {
		const combat = {
			...createEmptyCombatState(),
			lastRoll: {
				heroId: "h1",
				enemyId: "e1",
				heroResults: [3],
				heroTotal: 3,
				heroBreakdown: [],
				enemyResults: [2],
				enemyTotal: 2,
				enemyBreakdown: [],
			},
		};
		const state = baseState({ combat });
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "evt_roll",
				sourceHeroId: "h1",
				skillId: "skill_rift_rune",
			},
			{ value: 2 },
		);
		const result = drainStack(testEngine,
			evaluate(
				[{ kind: "i_modify_die", delta: "$value", die_side: "hero" }],
				ctx,
			),
		);
		expect(gameOf(result).combat?.pendingDiceSelection).toBeDefined();
		expect(gameOf(result).combat?.pendingDiceSelection?.heroId).toBe("h1");
	});

	it("retorna estado inalterado sem lastRoll", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "evt_roll",
				sourceHeroId: "h1",
				skillId: "skill_rift_rune",
			},
			{ value: 2 },
		);
		const result = drainStack(testEngine,
			evaluate(
				[{ kind: "i_modify_die", delta: "$value", die_side: "hero" }],
				ctx,
			),
		);
		expect(gameOf(result).combat?.pendingDiceSelection).toBeUndefined();
	});
});

// ── #22 power_supreme_rift_rune — migrado para DSL i_set_die (patch-21 Lote F) ─

describe("power_supreme_rift_rune — i_set_die (patch-21 Lote F)", () => {
	it("define pendingDiceSelection set_to 6 em qualquer lado", () => {
		const combat = {
			...createEmptyCombatState(),
			lastRoll: {
				heroId: "h1",
				enemyId: "e1",
				heroResults: [2],
				heroTotal: 2,
				heroBreakdown: [],
				enemyResults: [3],
				enemyTotal: 3,
				enemyBreakdown: [],
			},
		};
		const state = baseState({ combat });
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "evt_roll",
				sourceHeroId: "h1",
				skillId: "power_supreme_rift_rune",
			},
			{},
		);
		const result = drainStack(testEngine,
			evaluate([{ kind: "i_set_die", value: 6, die_side: "any" }], ctx),
		);
		expect(gameOf(result).combat?.pendingDiceSelection?.action).toBe("set_to");
		expect(gameOf(result).combat?.pendingDiceSelection?.setToValue).toBe(6);
		expect(gameOf(result).combat?.pendingDiceSelection?.side).toBe("any");
	});
});

// ── #23 power_hunter_execution — migrado para DSL p_modifier + i_set_die ─────

describe("power_hunter_execution — p_modifier + i_set_die (patch-21 Lote F)", () => {
	it("adiciona bônus e pendingDiceSelection quando lastRoll presente", () => {
		const combat = {
			...createEmptyCombatState(),
			prey: "e1",
			pairs: [{ heroId: "h1", enemyId: "e1" }],
			lastRoll: {
				heroId: "h1",
				enemyId: "e1",
				heroResults: [3],
				heroTotal: 3,
				heroBreakdown: [],
				enemyResults: [2],
				enemyTotal: 2,
				enemyBreakdown: [],
			},
		};
		const state = baseState({ combat, activeEnemies: [makeEnemy()] });
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "evt_roll",
				sourceHeroId: "h1",
				skillId: "power_hunter_execution",
			},
			{},
		);
		const result = drainStack(testEngine,
			evaluate(
				[
					{
						kind: "p_modifier",
						to: "$source",
						stat: "s_damage_dealt",
						operation: "add",
						value: 1,
						duration: { kind: "once" },
					},
					{ kind: "i_set_die", value: 6, die_side: "hero" },
				],
				ctx,
			),
		);
		const mods = getComponents<ModifierComponent>(
			gameOf(result).world,
			"h1",
			"modifier",
		).filter((m) => m.target === "damage_dealt");
		expect(mods.some((m) => m.value === 1)).toBe(true);
		expect(gameOf(result).combat?.pendingDiceSelection?.action).toBe("set_to");
	});
});

// ── #24 skill_focus_deflection ────────────────────────────────────────────────

describe("skill_focus_deflection (#24)", () => {
	it("define pendingSkillChoice com opções de redirect ou tohit", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "once_per_room_on_targeted",
				sourceHeroId: "h1",
				skillId: "skill_focus_deflection",
			},
			{ value: 2 },
		);
		const result = runScript("skill_focus_deflection", ctx);
		expect(pendingSkillChoiceOf(result)).toBeDefined();
		expect(
			pendingSkillChoiceOf(result)?.options.some((o) => o.id === "tohit"),
		).toBe(true);
	});
});

// ── #25 skill_opportunity_shot ────────────────────────────────────────────────

describe("skill_opportunity_shot (#25)", () => {
	it("causa dano igual ao damage base do herói na criatura alvo", () => {
		const state = baseState({ activeEnemies: [makeEnemy()] });
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "once_per_combat_instead_of_attack",
				sourceHeroId: "h1",
				targetEnemyIds: ["e1"],
				skillId: "skill_opportunity_shot",
			},
			{},
		);
		const result = drainStack(testEngine, runScript("skill_opportunity_shot", ctx));
		const enemy = enemiesOf(result).find((e) => e.id === "e1");
		// hero.damage = 3, enemy starts at 4 → 4 - 3 = 1
		expect(enemy?.currentLife).toBe(1);
	});

	it("retorna estado inalterado sem alvo válido", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "once_per_combat_instead_of_attack",
				sourceHeroId: "h1",
				skillId: "skill_opportunity_shot",
			},
			{},
		);
		const result = runScript("skill_opportunity_shot", ctx);
		expect(result).toBe(state);
	});
});

// ── #26 skill_rekindled_forge ─────────────────────────────────────────────────

describe("skill_rekindled_forge (#26)", () => {
	it("abre pendingSkillChoice com itens descartados", () => {
		const state = withDecks({
			...baseState(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				itemDeck: {
					available: [],
					discarded: ["Espada Velha", "Escudo Lascado"],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "on_win_room",
				sourceHeroId: "h1",
				skillId: "skill_rekindled_forge",
			},
			{},
		);
		const result = runScript("skill_rekindled_forge", ctx);
		expect(pendingSkillChoiceOf(result)).toBeDefined();
		expect(pendingSkillChoiceOf(result)?.options).toHaveLength(2);
	});

	it("loga se não há itens descartados", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "on_win_room",
				sourceHeroId: "h1",
				skillId: "skill_rekindled_forge",
			},
			{},
		);
		const result = runScript("skill_rekindled_forge", ctx);
		expect(gameOf(result).eventLog.some((l) => l.includes("nenhum item"))).toBe(true);
	});
});

// ── #27 dungeon_skill_rekindled_forge ─────────────────────────────────────────

describe("dungeon_skill_rekindled_forge (#27)", () => {
	it("retira primeiro item do deck disponível e coloca em pendingRewards", () => {
		const state = withDecks({
			...baseState(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				itemDeck: {
					available: ["Adaga", "Escudo"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "on_win_room",
				sourceHeroId: "h1",
				skillId: "dungeon_skill_rekindled_forge",
			},
			{},
		);
		const result = runScript("dungeon_skill_rekindled_forge", ctx);
		expect(gameOf(result).pendingRewards).toHaveLength(1);
		expect(gameOf(result).pendingRewards[0].cardId).toBeTruthy(); // was cardName: "Adaga");
		expect(deckOf(result, "itemDeck").available).toHaveLength(1);
	});
});

// ── #28 skill_rift_evasion ────────────────────────────────────────────────────

describe("skill_rift_evasion (#28)", () => {
	it("ativa itemControlByEnemy para o inimigo-fonte", () => {
		const state = baseState({ activeEnemies: [makeEnemy()] });
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "first_item_effect_received",
				sourceEnemyId: "e1",
				skillId: "skill_rift_evasion",
			},
			{},
		);
		const result = runScript("skill_rift_evasion", ctx);
		expect(scopedFlagOf(result, "combat", "itemControl", "e1")).toBe(true);
	});

	it("não ativa duas vezes no mesmo combate", () => {
		const state = withScopedFlag(
			baseState({ activeEnemies: [makeEnemy()] }),
			"combat",
			"oncePer",
			"itemControl::e1",
		);
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "first_item_effect_received",
				sourceEnemyId: "e1",
				skillId: "skill_rift_evasion",
			},
			{},
		);
		const result = runScript("skill_rift_evasion", ctx);
		expect(result).toBe(state);
	});
});

// ── #29 dungeon_skill_summon_guardian ─────────────────────────────────────────

describe("dungeon_skill_summon_guardian (#29)", () => {
	it("seta discardDungeonLocked=true quando guardião é revelado", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "on_room_reveal",
				skillId: "dungeon_skill_summon_guardian",
			},
			{ value: "Carcereiro" },
		);
		const result = runScript("dungeon_skill_summon_guardian", ctx);
		expect(gameOf(result).flags.discardDungeonLocked).toBe(true);
	});
});

// ── #30 power_deep_veil_echo ──────────────────────────────────────────────────

describe("power_deep_veil_echo (#30)", () => {
	it("concede 1 Eco ao herói-fonte", () => {
		const state = baseState();
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "once_per_game_on_defeat_creature",
				sourceHeroId: "h1",
				skillId: "power_deep_veil_echo",
			},
			{},
		);
		const result = runScript("power_deep_veil_echo", ctx);
		expect(scopedCountOf(result, "combat", "eco", "h1")).toBe(1);
	});

	it("acumula eco existente", () => {
		const state = withScopedCount(baseState(), "combat", "eco", "h1", 1);
		const ctx = buildScriptCtx(testEngine,
			state,
			{
				triggeredBy: "once_per_game_on_defeat_creature",
				sourceHeroId: "h1",
				skillId: "power_deep_veil_echo",
			},
			{},
		);
		const result = runScript("power_deep_veil_echo", ctx);
		expect(scopedCountOf(result, "combat", "eco", "h1")).toBe(2);
	});
});

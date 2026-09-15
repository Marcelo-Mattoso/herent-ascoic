// Testes de aceite Patch-16 Lote B — novos kinds DSL e skills #7-#20.

import { describe, expect, it } from "vitest";
import { SKILLS } from "../../../data/skills";
import { drainStack } from "../../../effects/resolver";
import { discardFromDungeonDeck } from "../../../reducer/exploration";
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

function defEffect(id: string) {
	const def = SKILLS.abilities.find((s) => s.id === id);
	if (!def?.effect) throw new Error(`Skill ${id} não tem effect DSL`);
	return def.effect;
}

// ── prevent_next_damage ───────────────────────────────────────────────────────

describe("prevent_next_damage (kinds #7 / #9)", () => {
	it("seta flag firstDamagePrevented para o alvo", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "once_per_round_on_damage_taken",
				sourceHeroId: "h1",
				targetHeroIds: ["h1"],
			},
			{},
		);
		const result = drainStack(
			evaluate([{ kind: "i_prevent_next_damage", to: "$target" }], ctx),
		);
		expect(result.flags["firstDamagePrevented::h1"]).toBe(true);
	});

	it("#9 skill_last_light_shield — efeito via catalog", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "once_per_round_on_damage_taken",
				sourceHeroId: "h1",
				targetHeroIds: ["h1"],
			},
			{},
		);
		const result = drainStack(
			evaluate(defEffect("skill_last_light_shield"), ctx),
		);
		expect(result.flags["firstDamagePrevented::h1"]).toBe(true);
	});

	it("#7 purple_crimson_plate — seta flag no source (inimigo)", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "first_damage_each_round", sourceEnemyId: "e1" },
			{},
		);
		const result = drainStack(evaluate(defEffect("purple_crimson_plate"), ctx));
		expect(result.flags["firstDamagePrevented::e1"]).toBe(true);
	});
});

// ── ignore_next_targeting (#10) ───────────────────────────────────────────────

describe("ignore_next_targeting — skill_protective_veil (#10)", () => {
	it("seta targetProtectionByHero para o herói-fonte", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "once_per_room_on_targeted_by_effect",
				sourceHeroId: "h1",
			},
			{},
		);
		const result = drainStack(
			evaluate(defEffect("skill_protective_veil"), ctx),
		);
		expect(result.combat?.targetProtectionByHero["h1"]).toBe(true);
	});
});

// ── recover_dungeon (#11 / #12) ───────────────────────────────────────────────

describe("i_recover_dungeon", () => {
	it("#11 skill_return_rite — paga 3 vida e recupera 1 carta do descarte", () => {
		const state = {
			...stateWithCombat({ heroes: [makeHero({ currentLife: 8 })] }),
			decks: {
				...createInitialGameState(CFG).decks,
				dungeonDeck: {
					available: [],
					discarded: ["Sala A", "Sala B"],
					removed: [] as string[],
				},
			},
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "once_per_room", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(evaluate(defEffect("skill_return_rite"), ctx));
		expect(result.heroes[0].currentLife).toBe(5); // 8 - 3
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
		expect(result.decks.dungeonDeck.discarded).toHaveLength(1);
	});

	it("#12 power_restored_path — recupera 1 carta sem custo", () => {
		const state = {
			...stateWithCombat(),
			decks: {
				...createInitialGameState(CFG).decks,
				dungeonDeck: {
					available: [],
					discarded: ["Sala X"],
					removed: [] as string[],
				},
			},
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "once_per_game", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(evaluate(defEffect("power_restored_path"), ctx));
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
		expect(result.heroes[0].currentLife).toBe(10); // sem custo
	});
});

// ── mark_target (#13) ─────────────────────────────────────────────────────────

describe("mark_target — skill_prey_mark (#13)", () => {
	it("define prey global e por herói", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "start_of_combat",
				sourceHeroId: "h1",
				targetEnemyIds: ["e1"],
			},
			{ value: 1 },
		);
		const result = drainStack(evaluate(defEffect("skill_prey_mark"), ctx));
		expect(result.combat?.prey).toBe("e1");
		expect(result.combat?.preyByHero).toEqual({ h1: "e1" });
	});
});

// ── draw_from — resolver case (#14) ──────────────────────────────────────────

describe("draw_from — item_skill_mystic_draw (#14)", () => {
	it("move 1 artefato do deck para os artefatos ativos do grupo", () => {
		const state = {
			...stateWithCombat(),
			decks: {
				...createInitialGameState(CFG).decks,
				artifactDeck: {
					available: ["Amuleto Antigo", "Anel de Fogo"],
					discarded: [],
					removed: [] as string[],
				},
			},
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_use", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(
			evaluate(defEffect("item_skill_mystic_draw"), ctx),
		);
		expect(result.pendingRewards).toHaveLength(0);
		expect(result.groupArtifacts).toHaveLength(1);
		expect(result.groupArtifacts[0].cardId).toBeTruthy(); // was cardName: "Amuleto Antigo");
		expect(result.groupArtifacts[0].carriedBy).toBeNull();
		expect(result.decks.artifactDeck.available).toHaveLength(1);
	});
});

// ── prevent_dungeon_discard (#15 / #16 / #17) ─────────────────────────────────

describe("i_prevent_dungeon_discard", () => {
	it("#15 skill_preserved_path — seta flag dungeonDiscardPrevented", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "once_per_room_on_dungeon_discard", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(evaluate(defEffect("skill_preserved_path"), ctx));
		expect(result.flags.dungeonDiscardPrevented).toBe(true);
	});

	it("quando dungeonDiscardPrevented=true, discardFromDungeonDeck é cancelado", () => {
		const state = {
			...stateWithCombat(),
			flags: { dungeonDiscardPrevented: true },
			decks: {
				...createInitialGameState(CFG).decks,
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			},
		};
		const result = discardFromDungeonDeck(state, 1);
		expect(result.decks.dungeonDeck.available).toHaveLength(2); // não descartou
		expect(result.flags.dungeonDiscardPrevented).toBe(false); // flag consumida
	});

	it("quando discardDungeonLocked=true, prevenção é ignorada", () => {
		const state = {
			...stateWithCombat(),
			flags: { dungeonDiscardPrevented: true, discardDungeonLocked: true },
			decks: {
				...createInitialGameState(CFG).decks,
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			},
		};
		const result = discardFromDungeonDeck(state, 1);
		expect(result.decks.dungeonDeck.available).toHaveLength(1); // descartou normalmente
	});
});

// ── draw_and_choose (#18 / #19) ───────────────────────────────────────────────

describe("draw_and_choose — skill_forge_spoils (#18)", () => {
	it("remove 2 itens do deck e define pendingSkillChoice", () => {
		const state = {
			...stateWithCombat(),
			decks: {
				...createInitialGameState(CFG).decks,
				itemDeck: {
					available: ["Espada", "Escudo", "Poção"],
					discarded: [],
					removed: [] as string[],
				},
			},
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_win_room", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(evaluate(defEffect("skill_forge_spoils"), ctx));
		expect(result.decks.itemDeck.available).toHaveLength(1); // 2 removidos
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options).toHaveLength(2);
		expect(result.pendingSkillChoice?.options[0].effect).toBeDefined();
	});
});

// ── reveal_dungeon (#20) ──────────────────────────────────────────────────────

describe("reveal_dungeon — skill_illuminate_path (#20)", () => {
	it("mostra N cartas do topo do deck em pendingSkillChoice", () => {
		const state = {
			...stateWithCombat(),
			decks: {
				...createInitialGameState(CFG).decks,
				dungeonDeck: {
					available: ["Sala Oculta", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			},
		};
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "on_reveal_paths", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(
			evaluate(defEffect("skill_illuminate_path"), ctx),
		);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(
			result.pendingSkillChoice?.options.some((o) => o.label === "Sala Oculta"),
		).toBe(true);
		// deck não é modificado (apenas mostra)
		expect(result.decks.dungeonDeck.available).toHaveLength(2);
	});
});

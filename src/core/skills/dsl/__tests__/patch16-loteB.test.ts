import { describe, expect, it } from "vitest";
import { SKILLS } from "../../../data/skills";
import { drainStack } from "../../../effects/resolver";
import { reducer } from "../../../reducer";
import { discardFromDungeonDeck } from "../../../reducer/exploration";
import { buildScriptCtx } from "../../../scripts/context";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { evaluate } from "../evaluate";
import "../../handlers/index";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, heroesOf, withDecks } from "@/core/state/access";
import { settledWith, type LooseGame } from "../../../__tests__/fixtures";
import { pendingSkillChoiceOf, scopedFlagOf, withPendingSkillChoice } from "../../../state/access";
import { gameOf, withGame } from "../../../../engine/state";

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

function stateWithCombat(extra: Partial<LooseGame> = {}): GameState {
	return settledWith(createInitialGameState(CFG), {
		heroes: [makeHero()],
		combat: createEmptyCombatState(),
		...extra,
	});
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
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "once_per_round_on_damage_taken",
				sourceHeroId: "h1",
				targetHeroIds: ["h1"],
			},
			{},
		);
		const result = drainStack(testEngine, 
			evaluate([{ kind: "i_prevent_next_damage", to: "$target" }], ctx),
		);
		expect(gameOf(result).flags["firstDamagePrevented::h1"]).toBe(true);
	});

	it("#9 skill_last_light_shield — efeito via catalog", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "once_per_round_on_damage_taken",
				sourceHeroId: "h1",
				targetHeroIds: ["h1"],
			},
			{},
		);
		const result = drainStack(testEngine, 
			evaluate(defEffect("skill_last_light_shield"), ctx),
		);
		expect(gameOf(result).flags["firstDamagePrevented::h1"]).toBe(true);
	});

	it("#7 purple_crimson_plate — seta flag no source (inimigo)", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "first_damage_each_round", sourceEnemyId: "e1" },
			{},
		);
		const result = drainStack(testEngine, evaluate(defEffect("purple_crimson_plate"), ctx));
		expect(gameOf(result).flags["firstDamagePrevented::e1"]).toBe(true);
	});
});

// ── ignore_next_targeting (#10) ───────────────────────────────────────────────

describe("ignore_next_targeting — skill_protective_veil (#10)", () => {
	it("seta targetProtectionByHero para o herói-fonte", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "once_per_room_on_targeted_by_effect",
				sourceHeroId: "h1",
			},
			{},
		);
		const result = drainStack(testEngine, 
			evaluate(defEffect("skill_protective_veil"), ctx),
		);
		expect(scopedFlagOf(result, "combat", "targetProtection", "h1")).toBe(true);
	});
});

// ── recover_dungeon (#11 / #12) ───────────────────────────────────────────────

describe("i_recover_dungeon", () => {
	it("#11 skill_return_rite — paga 3 vida e recupera 1 carta do descarte", () => {
		const state = withDecks({
			...stateWithCombat({ heroes: [makeHero({ currentLife: 8 })] }),
		}, {
				...decksOf(createInitialGameState(CFG)),
				dungeonDeck: {
					available: [],
					discarded: ["Sala A", "Sala B"],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "once_per_room", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(testEngine, evaluate(defEffect("skill_return_rite"), ctx));
		expect(heroesOf(result)[0].currentLife).toBe(5); // 8 - 3
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1);
		expect(deckOf(result, "dungeonDeck").discarded).toHaveLength(1);
	});

	it("#12 power_restored_path — recupera 1 carta sem custo", () => {
		const state = withDecks({
			...stateWithCombat(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				dungeonDeck: {
					available: [],
					discarded: ["Sala X"],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "once_per_game", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(testEngine, evaluate(defEffect("power_restored_path"), ctx));
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1);
		expect(heroesOf(result)[0].currentLife).toBe(10); // sem custo
	});
});

// ── mark_target (#13) ─────────────────────────────────────────────────────────

describe("mark_target — skill_prey_mark (#13)", () => {
	it("define prey global e por herói", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "start_of_combat",
				sourceHeroId: "h1",
				targetEnemyIds: ["e1"],
			},
			{ value: 1 },
		);
		const result = drainStack(testEngine, evaluate(defEffect("skill_prey_mark"), ctx));
		expect(gameOf(result).combat?.prey).toBe("e1");
		expect(gameOf(result).combat?.preyByHero).toEqual({ h1: "e1" });
	});
});

// ── draw_from — resolver case (#14) ──────────────────────────────────────────

describe("draw_from — item_skill_mystic_draw (#14)", () => {
	it("move 1 artefato do deck para os artefatos ativos do grupo", () => {
		const state = withDecks({
			...stateWithCombat(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				artifactDeck: {
					available: ["Amuleto Antigo", "Anel de Fogo"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "on_use", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(testEngine, 
			evaluate(defEffect("item_skill_mystic_draw"), ctx),
		);
		expect(gameOf(result).pendingRewards).toHaveLength(0);
		expect(gameOf(result).groupArtifacts).toHaveLength(1);
		expect(gameOf(result).groupArtifacts[0].cardId).toBeTruthy(); // was cardName: "Amuleto Antigo");
		expect(gameOf(result).groupArtifacts[0].carriedBy).toBeNull();
		expect(deckOf(result, "artifactDeck").available).toHaveLength(1);
	});
});

// ── prevent_dungeon_discard (#15 / #16 / #17) ─────────────────────────────────

describe("i_prevent_dungeon_discard", () => {
	it("#15 skill_preserved_path — seta flag dungeonDiscardPrevented", () => {
		const state = stateWithCombat();
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "once_per_room_on_dungeon_discard", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(testEngine, evaluate(defEffect("skill_preserved_path"), ctx));
		expect(gameOf(result).flags.dungeonDiscardPrevented).toBe(true);
	});

	it("quando dungeonDiscardPrevented=true, discardFromDungeonDeck é cancelado", () => {
		const state = withDecks(withGame(stateWithCombat(), (prevGame) => ({ ...prevGame, flags: { dungeonDiscardPrevented: true } })), {
				...decksOf(createInitialGameState(CFG)),
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const result = discardFromDungeonDeck(testEngine, state, 1);
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(2); // não descartou
		expect(gameOf(result).flags.dungeonDiscardPrevented).toBe(false); // flag consumida
	});

	it("quando discardDungeonLocked=true, prevenção é ignorada", () => {
		const state = withDecks(withGame(stateWithCombat(), (prevGame) => ({ ...prevGame, flags: { dungeonDiscardPrevented: true, discardDungeonLocked: true } })), {
				...decksOf(createInitialGameState(CFG)),
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const result = discardFromDungeonDeck(testEngine, state, 1);
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1); // descartou normalmente
	});
});

// ── draw_and_choose (#18 / #19) ───────────────────────────────────────────────

describe("draw_and_choose — skill_forge_spoils (#18)", () => {
	it("remove 2 itens do deck e define pendingSkillChoice", () => {
		const state = withDecks({
			...stateWithCombat(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				itemDeck: {
					available: ["Espada", "Escudo", "Poção"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "on_win_room", sourceHeroId: "h1" },
			{},
		);
		const result = drainStack(testEngine, evaluate(defEffect("skill_forge_spoils"), ctx));
		expect(deckOf(result, "itemDeck").available).toHaveLength(1); // 2 removidos
		expect(pendingSkillChoiceOf(result)).toBeDefined();
		expect(pendingSkillChoiceOf(result)?.options).toHaveLength(2);
		expect(pendingSkillChoiceOf(result)?.options[0].effect).toBeDefined();
	});

	it("descarta uma revelada sem fechar a escolha e guarda a outra", () => {
		const state = withDecks(withPendingSkillChoice(stateWithCombat(), {
				skillId: "skill_forge_spoils",
				prompt: "Escolha 1 carta para ficar",
				kind: "draw_and_choose" as const,
				discardDeck: "itemDeck" as const,
				options: [
					{
						id: "item_rusty_dagger",
						label: "item_rusty_dagger",
						effect: [
							{
								kind: "i_grant_reward" as const,
								rewardType: "item" as const,
								cardId: "item_rusty_dagger",
							},
						],
					},
					{
						id: "item_cracked_shield",
						label: "item_cracked_shield",
						effect: [
							{
								kind: "i_grant_reward" as const,
								rewardType: "item" as const,
								cardId: "item_cracked_shield",
							},
						],
					},
				],
			}), {
				...decksOf(createInitialGameState(CFG)),
				itemDeck: { available: [], discarded: [], removed: [] as string[] },
			});
		const afterDiscard = reducer(testEngine, state, {
			type: "SKILL_CHOICE",
			payload: {
				skillId: "skill_forge_spoils",
				choice: "__discard__:item_rusty_dagger",
			},
		});
		expect(pendingSkillChoiceOf(afterDiscard)?.options).toHaveLength(1);
		expect(deckOf(afterDiscard, "itemDeck").discarded).toContain(
			"item_rusty_dagger",
		);

		const afterKeep = reducer(testEngine, afterDiscard, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_forge_spoils", choice: "item_cracked_shield" },
		});
		expect(pendingSkillChoiceOf(afterKeep)).toBeUndefined();
		expect(gameOf(afterKeep).pendingRewards.map((reward) => reward.cardId)).toContain(
			"item_cracked_shield",
		);
	});

	it("recusa opção ou skillId inválidos sem consumir a escolha pendente", () => {
		const state: GameState = withPendingSkillChoice(stateWithCombat(), {
				skillId: "skill_forge_spoils",
				prompt: "Escolha um item",
				kind: "draw_and_choose",
				discardDeck: "itemDeck",
				options: [{ id: "item_rusty_dagger", label: "item_rusty_dagger" }],
			});
		for (const [skillId, choice] of [
			["outra_skill", "item_rusty_dagger"],
			["skill_forge_spoils", "item_cracked_shield"],
			["skill_forge_spoils", "__discard__:item_cracked_shield"],
			["skill_forge_spoils", "__skip__"],
		]) {
			const result = reducer(testEngine, state, {
				type: "SKILL_CHOICE",
				payload: { skillId, choice },
			});
			expect(pendingSkillChoiceOf(result)).toEqual(pendingSkillChoiceOf(state));
			expect(decksOf(result)).toEqual(decksOf(state));
			expect(gameOf(result).pendingRewards).toEqual(gameOf(state).pendingRewards);
		}
	});
});

// ── reveal_dungeon (#20) ──────────────────────────────────────────────────────

describe("reveal_dungeon — skill_illuminate_path (#20)", () => {
	it("mostra N cartas do topo do deck em pendingSkillChoice", () => {
		const state = withDecks({
			...stateWithCombat(),
		}, {
				...decksOf(createInitialGameState(CFG)),
				dungeonDeck: {
					available: ["Sala Oculta", "Sala B"],
					discarded: [],
					removed: [] as string[],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{ triggeredBy: "on_reveal_paths", sourceHeroId: "h1" },
			{ value: 1 },
		);
		const result = drainStack(testEngine, 
			evaluate(defEffect("skill_illuminate_path"), ctx),
		);
		expect(pendingSkillChoiceOf(result)).toBeDefined();
		expect(
			pendingSkillChoiceOf(result)?.options.some((o) => o.label === "Sala Oculta"),
		).toBe(true);
		// deck não é modificado (apenas mostra)
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(2);
	});
});

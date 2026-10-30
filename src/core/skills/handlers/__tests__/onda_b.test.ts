import { describe, expect, it } from "vitest";
import { buildScriptCtx } from "../../../scripts/context";
import { evaluate } from "../../dsl/evaluate";
// Importar index para que registerContinuation seja chamado
import "../index";
import { reducer } from "../../../reducer";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import { gameOf } from "@/engine/state";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, heroesOf, withDecks } from "@/core/state/access";
import { type LooseGame, settledWith } from "../../../__tests__/fixtures";
import { pendingSkillChoiceOf, withPendingSkillChoice } from "../../../state/access";
import type { PendingSkillChoice } from "../../../choices";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 1,
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

function makeState(
	overrides: Partial<LooseGame> & { pendingSkillChoice?: PendingSkillChoice } = {},
): GameState {
	const { pendingSkillChoice, ...rest } = overrides;
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	return withPendingSkillChoice(
		settledWith(base, {
			heroes: [makeHero()],
			combat: createEmptyCombatState(),
			...rest,
		}),
		pendingSkillChoice,
	);
}

// ── DSL choose_one: dark_tribute (portado de item_or_discardDungeon) ──────────

describe("DSL choose_one — dark_tribute", () => {
	const darkTributeEffect = [
		{
			kind: "i_choose_one" as const,
			options: [
				{
					id: "discard_item",
					params: { value: 1 },
					effect: [
						{ kind: "i_discard" as const, pile: "item" as const, count: 1 },
					],
				},
				{
					id: "discard_dungeon",
					params: { value: 1 },
					effect: [
						{
							kind: "i_discard" as const,
							pile: "dungeon" as const,
							count: 1,
						},
					],
				},
			],
		},
	];

	it("abre pendingSkillChoice com opções DSL", () => {
		const state = makeState({
			heroes: [makeHero({ backpack: ["Adaga Enferrujada"] })],
		});
		const ctx = buildScriptCtx(testEngine, 
			state,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const result = evaluate(darkTributeEffect, ctx);
		expect(pendingSkillChoiceOf(result)).toBeDefined();
		expect(pendingSkillChoiceOf(result)?.options.map((o) => o.id)).toContain(
			"discard_item",
		);
		expect(pendingSkillChoiceOf(result)?.options.map((o) => o.id)).toContain(
			"discard_dungeon",
		);
	});

	it("escolha 'dungeon' descarta 1 carta do deck via SKILL_CHOICE", () => {
		const base = withDecks(makeState({
		}), {
				...decksOf(createInitialGameState({ heroCardIds: [] })),
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [],
				},
			});
		const ctx = buildScriptCtx(testEngine, 
			base,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(testEngine, withChoice, {
			type: "SKILL_CHOICE",
			payload: {
				skillId: "skill_dark_tribute",
				choice: "discard_dungeon",
			},
		});
		expect(deckOf(result, "dungeonDeck").available).toHaveLength(1);
		expect(pendingSkillChoiceOf(result)).toBeUndefined();
	});

	it("escolha 'item' remove item da mochila via SKILL_CHOICE", () => {
		const base = makeState({
			heroes: [makeHero({ backpack: ["Poção de Vigor Menor"] })],
		});
		const ctx = buildScriptCtx(testEngine, 
			base,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(testEngine, withChoice, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_dark_tribute", choice: "discard_item" },
		});
		expect(heroesOf(result)[0].backpack).toHaveLength(0);
		expect(pendingSkillChoiceOf(result)).toBeUndefined();
	});
});

// ── SKILL_CHOICE reducer ──────────────────────────────────────────────────────

describe("reducer SKILL_CHOICE", () => {
	it("sem pendingSkillChoice, retorna estado inalterado (exceto actionLog)", () => {
		const state = makeState();
		const result = reducer(testEngine, state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "x", choice: "y" },
		});
		// actionLog sempre acumula — compara o resto do estado
		const { actionLog: _a, ...restResult } = gameOf(result);
		const { actionLog: _b, ...restState } = gameOf(state);
		expect(restResult).toEqual(restState);
	});

	it("com pendingSkillChoice mas sem continuação registrada, limpa o campo", () => {
		const state = makeState({
			pendingSkillChoice: {
				skillId: "habilidade-inexistente",
				prompt: "p",
				options: [{ id: "a", label: "A" }],
			},
		});
		const result = reducer(testEngine, state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "habilidade-inexistente", choice: "a" },
		});
		expect(pendingSkillChoiceOf(result)).toBeUndefined();
	});

	it("não permite pular uma escolha obrigatória", () => {
		const state = makeState({
			pendingSkillChoice: {
				skillId: "skill_dark_tribute",
				prompt: "p",
				options: [{ id: "discard_item", label: "Descartar item" }],
			},
		});
		const result = reducer(testEngine, state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_dark_tribute", choice: "__skip__" },
		});
		expect(pendingSkillChoiceOf(result)).toEqual(pendingSkillChoiceOf(state));
	});

	it("permite pular apenas uma escolha marcada como opcional", () => {
		const state = makeState({
			pendingSkillChoice: {
				skillId: "power_last_light_oath",
				prompt: "p",
				allowSkip: true,
				options: [{ id: "heal_all", label: "Curar todos" }],
			},
		});
		const result = reducer(testEngine, state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "power_last_light_oath", choice: "__skip__" },
		});
		expect(pendingSkillChoiceOf(result)).toBeUndefined();
	});
});

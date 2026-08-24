// Testes da Onda B do patch-8: handlers com SKILL_CHOICE.
// Cada describe cobre 1 handler + continuação.

// Lote 3 (Patch-12): item_or_discardDungeon absorvido pela DSL choose_one.
// Testes portados para usar evaluate() + drainStack + reducer com novos option IDs.

import { describe, expect, it } from "vitest";
import { buildScriptCtx } from "../../../scripts/context";
import { evaluate } from "../../dsl/evaluate";
// Importar index para que registerContinuation seja chamado
import "../index";
import { reducer } from "../../../reducer";
import { createEmptyCombatState } from "../../../state/combatState";
import type { EnemyState } from "../../../state/enemyState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 1,
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

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardId: "creature_dark_cave_bat",
		maxLife: 3,
		currentLife: 3,
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

function makeState(overrides: Partial<GameState> = {}): GameState {
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	return {
		...base,
		heroes: [makeHero()],
		combat: createEmptyCombatState(),
		...overrides,
	};
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
		const ctx = buildScriptCtx(
			state,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const result = evaluate(darkTributeEffect, ctx);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options.map((o) => o.id)).toContain(
			"discard_item",
		);
		expect(result.pendingSkillChoice?.options.map((o) => o.id)).toContain(
			"discard_dungeon",
		);
	});

	it("escolha 'dungeon' descarta 1 carta do deck via SKILL_CHOICE", () => {
		const base = makeState({
			decks: {
				...createInitialGameState({ heroCardIds: [] }).decks,
				dungeonDeck: {
					available: ["Sala A", "Sala B"],
					discarded: [],
					removed: [],
				},
			},
		});
		const ctx = buildScriptCtx(
			base,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(withChoice, {
			type: "SKILL_CHOICE",
			payload: {
				skillId: "skill_dark_tribute",
				choice: "discard_dungeon",
			},
		});
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
		expect(result.pendingSkillChoice).toBeUndefined();
	});

	it("escolha 'item' remove item da mochila via SKILL_CHOICE", () => {
		const base = makeState({
			heroes: [makeHero({ backpack: ["Poção de Vigor Menor"] })],
		});
		const ctx = buildScriptCtx(
			base,
			{
				triggeredBy: "before_first_combat_in_room",
				skillId: "skill_dark_tribute",
			},
			{},
		);
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(withChoice, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_dark_tribute", choice: "discard_item" },
		});
		expect(result.heroes[0].backpack).toHaveLength(0);
		expect(result.pendingSkillChoice).toBeUndefined();
	});
});

// ── SKILL_CHOICE reducer ──────────────────────────────────────────────────────

describe("reducer SKILL_CHOICE", () => {
	it("sem pendingSkillChoice, retorna estado inalterado (exceto actionLog)", () => {
		const state = makeState();
		const result = reducer(state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "x", choice: "y" },
		});
		// actionLog sempre acumula — compara o resto do estado
		const { actionLog: _a, ...restResult } = result;
		const { actionLog: _b, ...restState } = state;
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
		const result = reducer(state, {
			type: "SKILL_CHOICE",
			payload: { skillId: "habilidade-inexistente", choice: "a" },
		});
		expect(result.pendingSkillChoice).toBeUndefined();
	});
});

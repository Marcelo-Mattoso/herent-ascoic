// Testes da Onda B do patch-8: handlers com SKILL_CHOICE.
// Cada describe cobre 1 handler + continuação.

// Lote 3 (Patch-12): item_or_discardDungeon absorvido pela DSL choose_one.
// Testes portados para usar evaluate() + drainStack + reducer com novos option IDs.

import { describe, expect, it } from "vitest";
import { handleItemControl } from "../itemControl";
import { handleTargetProtection } from "../targetProtection";
import { handleDungeon } from "../dungeon";
import { evaluate } from "../../dsl/evaluate";
import { drainStack } from "../../../effects/resolver";
import { buildScriptCtx } from "../../../scripts/context";
// Importar index para que registerContinuation seja chamado
import "../index";
import { reducer } from "../../../reducer";
import { createInitialGameState } from "../../../state/gameState";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import type { EnemyState } from "../../../state/enemyState";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardName: "Bárbaro Rubro",
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
		cardName: "Morcego do Teto Negro",
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
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
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
			kind: "choose_one" as const,
			options: [
				{ label: "Descartar 1 item", effect: [{ kind: "discard_from" as const, pile: "item" as const, count: 1 }] },
				{ label: "Descartar 1 carta de dungeon", effect: [{ kind: "discard_from" as const, pile: "dungeon" as const, count: 1 }] },
			],
		},
	];

	it("abre pendingSkillChoice com opções DSL", () => {
		const state = makeState({ heroes: [makeHero({ backpack: ["Adaga Enferrujada"] })] });
		const ctx = buildScriptCtx(state, { triggeredBy: "before_first_combat_in_room", skillId: "skill_dark_tribute" }, {});
		const result = evaluate(darkTributeEffect, ctx);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options.map((o) => o.label)).toContain("Descartar 1 item");
		expect(result.pendingSkillChoice?.options.map((o) => o.label)).toContain("Descartar 1 carta de dungeon");
	});

	it("escolha 'dungeon' descarta 1 carta do deck via SKILL_CHOICE", () => {
		const base = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["Sala A", "Sala B"], discarded: [], removed: [] },
			},
		});
		const ctx = buildScriptCtx(base, { triggeredBy: "before_first_combat_in_room", skillId: "skill_dark_tribute" }, {});
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(withChoice, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_dark_tribute", choice: "Descartar 1 carta de dungeon" },
		});
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
		expect(result.pendingSkillChoice).toBeUndefined();
	});

	it("escolha 'item' remove item da mochila via SKILL_CHOICE", () => {
		const base = makeState({ heroes: [makeHero({ backpack: ["Poção de Vigor Menor"] })] });
		const ctx = buildScriptCtx(base, { triggeredBy: "before_first_combat_in_room", skillId: "skill_dark_tribute" }, {});
		const withChoice = evaluate(darkTributeEffect, ctx);
		const result = reducer(withChoice, {
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_dark_tribute", choice: "Descartar 1 item" },
		});
		expect(result.heroes[0].backpack).toHaveLength(0);
		expect(result.pendingSkillChoice).toBeUndefined();
	});
});

// ── itemControl ───────────────────────────────────────────────────────────────

describe("handleItemControl", () => {
	it("liga itemControlByEnemy para o inimigo-fonte", () => {
		const state = makeState({ activeEnemies: [makeEnemy()] });
		const result = handleItemControl(
			state,
			{ triggeredBy: "first_item_effect_received", sourceEnemyId: "e1" },
			null,
		);
		expect(result.combat?.itemControlByEnemy["e1"]).toBe(true);
	});

	it("não bloqueia novamente após o primeiro bloqueio (oncePer.combat)", () => {
		const combat = {
			...createEmptyCombatState(),
			itemControlByEnemy: { e1: false },
			oncePer: { room: {}, combat: { "itemControl::e1": true }, round: {} },
		};
		const state = makeState({ activeEnemies: [makeEnemy()], combat });
		const result = handleItemControl(
			state,
			{ triggeredBy: "first_item_effect_received", sourceEnemyId: "e1" },
			null,
		);
		// Flag não deve ser re-setada
		expect(result.combat?.itemControlByEnemy["e1"]).toBeFalsy();
	});
});

// ── targetProtection ──────────────────────────────────────────────────────────

describe("handleTargetProtection", () => {
	it("liga targetProtectionByHero para o herói-fonte", () => {
		const state = makeState();
		const result = handleTargetProtection(
			state,
			{ triggeredBy: "on_targeted", sourceHeroId: "h1" },
			null,
		);
		expect(result.combat?.targetProtectionByHero["h1"]).toBe(true);
	});
});

// ── dungeon ───────────────────────────────────────────────────────────────────

describe("handleDungeon", () => {
	it("define pendingSkillChoice mostrando topo do deck de dungeon", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["Sala Secreta", "Sala B"], discarded: [], removed: [] },
			},
		});
		const result = handleDungeon(
			state,
			{ triggeredBy: "on_reveal_paths", skillId: "skill_illuminate_path" },
			1,
		);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options.some((o) => o.label === "Sala Secreta")).toBe(true);
	});

	it("continuação 'ok' limpa pendingSkillChoice sem alterar o deck", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["Sala A"], discarded: [], removed: [] },
			},
			pendingSkillChoice: {
				skillId: "skill_illuminate_path",
				prompt: "test",
				options: [{ id: "ok", label: "Confirmar" }],
			},
		});
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "skill_illuminate_path", choice: "ok" } });
		expect(result.pendingSkillChoice).toBeUndefined();
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
	});
});

// ── SKILL_CHOICE reducer ──────────────────────────────────────────────────────

describe("reducer SKILL_CHOICE", () => {
	it("sem pendingSkillChoice, retorna estado inalterado (exceto actionLog)", () => {
		const state = makeState();
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "x", choice: "y" } });
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
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "habilidade-inexistente", choice: "a" } });
		expect(result.pendingSkillChoice).toBeUndefined();
	});
});

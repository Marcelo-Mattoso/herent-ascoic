// Testes da Onda B do patch-8: handlers com SKILL_CHOICE.
// Cada describe cobre 1 handler + continuação.

import { describe, expect, it } from "vitest";
import { handleItemOrDiscardDungeon } from "../item_or_discardDungeon";
import { handleItemControl } from "../itemControl";
import { handleTargetProtection } from "../targetProtection";
import { handleDungeon } from "../dungeon";
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

// ── item_or_discardDungeon ────────────────────────────────────────────────────

describe("handleItemOrDiscardDungeon", () => {
	it("abre pendingSkillChoice com opções disponíveis", () => {
		const state = makeState({
			heroes: [makeHero({ backpack: ["Adaga Enferrujada"] })],
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["Sala X"], discarded: [], removed: [] },
			},
		});
		const result = handleItemOrDiscardDungeon(
			state,
			{ triggeredBy: "before_first_combat_in_room", skillId: "habilidade-tributo-sombrio" },
			null,
		);
		expect(result.pendingSkillChoice).toBeDefined();
		expect(result.pendingSkillChoice?.options.map((o) => o.id)).toContain("dungeon");
		expect(result.pendingSkillChoice?.options.map((o) => o.id)).toContain("item");
	});

	it("continuação 'dungeon' descarta 1 carta do deck", () => {
		const state = makeState({
			decks: {
				...createInitialGameState({ heroCardNames: [] }).decks,
				dungeonDeck: { available: ["Sala A", "Sala B"], discarded: [], removed: [] },
			},
			pendingSkillChoice: {
				skillId: "habilidade-tributo-sombrio",
				prompt: "test",
				options: [{ id: "dungeon", label: "Descartar" }],
			},
		});
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "habilidade-tributo-sombrio", choice: "dungeon" } });
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
		expect(result.pendingSkillChoice).toBeUndefined();
	});

	it("continuação 'item' remove item da mochila", () => {
		const state = makeState({
			heroes: [makeHero({ backpack: ["Poção de Vigor Menor"] })],
			pendingSkillChoice: {
				skillId: "habilidade-tributo-sombrio",
				prompt: "test",
				options: [{ id: "item", label: "Descartar" }],
			},
		});
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "habilidade-tributo-sombrio", choice: "item" } });
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
			{ triggeredBy: "on_reveal_paths", skillId: "habilidade-iluminar-o-caminho" },
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
				skillId: "habilidade-iluminar-o-caminho",
				prompt: "test",
				options: [{ id: "ok", label: "Confirmar" }],
			},
		});
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "habilidade-iluminar-o-caminho", choice: "ok" } });
		expect(result.pendingSkillChoice).toBeUndefined();
		expect(result.decks.dungeonDeck.available).toHaveLength(1);
	});
});

// ── SKILL_CHOICE reducer ──────────────────────────────────────────────────────

describe("reducer SKILL_CHOICE", () => {
	it("sem pendingSkillChoice, retorna estado inalterado", () => {
		const state = makeState();
		const result = reducer(state, { type: "SKILL_CHOICE", payload: { skillId: "x", choice: "y" } });
		expect(result).toEqual(state);
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

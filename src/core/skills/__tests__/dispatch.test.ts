import { heroesOf, withAwakening } from "@/core/state/access";
import { describe, expect, it } from "vitest";
import { drainStack } from "../../effects/resolver";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameConfig } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import { fireTrigger } from "../dispatch";
// Importar handlers para que o registry esteja populado
import "../handlers/index";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled } from "../../__tests__/fixtures";
import { gameOf, withGame } from "../../../engine/state";

const config: GameConfig = { heroCardIds: ["hero_crimson_barbarian"] };

describe("fireTrigger", () => {
	it("retorna o estado inalterado quando não há handlers registrados", () => {
		const state = createInitialGameState(config);
		const result = fireTrigger(testEngine, state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
		});
		// Sem handlers, o estado deve ser idêntico
		expect(gameOf(result).eventLog).toEqual(gameOf(state).eventLog);
	});

	it("não explode quando chamado sem heróis ativos", () => {
		const state = createInitialGameState(config);
		expect(() =>
			fireTrigger(testEngine, state, "evt_combat_start", {
				triggeredBy: "evt_combat_start",
			}),
		).not.toThrow();
	});

	it("não explode quando chamado com combate ativo mas sem inimigos", () => {
		const state = withGame(createInitialGameState(config), (prevGame) => ({ ...prevGame, combat: createEmptyCombatState() }));
		expect(() =>
			fireTrigger(testEngine, state, "evt_roll", { triggeredBy: "evt_roll" }),
		).not.toThrow();
	});
});

// ── Filtro de purpleEffect (F1 do patch-8) ────────────────────────────────────

describe("purpleEffect filter", () => {
	// Morcego do Teto Negro: purpleEffect = Ruptura da Cura (healBlock, on_enter_room, heroes)
	const morcego: EnemyState = {
		id: "e1",
		cardId: "creature_black_ceiling_bat",
		maxLife: 3,
		currentLife: 3,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	it("purpleEffect NÃO dispara quando despertar é 3 (Vermelho)", () => {
		const state = settled(withGame(withAwakening(createInitialGameState(config), 3), (prevGame) => ({ ...prevGame, activeEnemies: [morcego], heroes: [
				{
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
					status: "active" as const,
					playerIndex: 0,
					xp: 0,
				},
			] })));
		const result = fireTrigger(testEngine, state, "evt_room_enter", {
			triggeredBy: "evt_room_enter",
		});
		expect(heroesOf(result)[0].healBlocked).toBeFalsy();
	});

	it("purpleEffect DISPARA quando despertar é 4 (Roxo)", () => {
		const state = settled(withGame(withAwakening(createInitialGameState(config), 4), (prevGame) => ({ ...prevGame, activeEnemies: [morcego], heroes: [
				{
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
					status: "active" as const,
					playerIndex: 0,
					xp: 0,
				},
			] })));
		// DSL-migrated skills push to EffectStack; drain to get final state
		const result = drainStack(testEngine, 
			fireTrigger(testEngine, state, "evt_room_enter", { triggeredBy: "evt_room_enter" }),
		);
		expect(heroesOf(result)[0].healBlocked).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { drainStack } from "../../effects/resolver";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameConfig } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import { fireTrigger } from "../dispatch";
// Importar handlers para que o registry esteja populado
import "../handlers/index";

const config: GameConfig = { heroCardNames: ["Bárbaro Rubro"] };

describe("fireTrigger", () => {
	it("retorna o estado inalterado quando não há handlers registrados", () => {
		const state = createInitialGameState(config);
		const result = fireTrigger(state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
		});
		// Sem handlers, o estado deve ser idêntico
		expect(result.eventLog).toEqual(state.eventLog);
	});

	it("não explode quando chamado sem heróis ativos", () => {
		const state = createInitialGameState(config);
		expect(() =>
			fireTrigger(state, "evt_combat_start", { triggeredBy: "evt_combat_start" }),
		).not.toThrow();
	});

	it("não explode quando chamado com combate ativo mas sem inimigos", () => {
		const state = {
			...createInitialGameState(config),
			combat: createEmptyCombatState(),
		};
		expect(() =>
			fireTrigger(state, "evt_roll", { triggeredBy: "evt_roll" }),
		).not.toThrow();
	});
});

// ── Filtro de purpleEffect (F1 do patch-8) ────────────────────────────────────

describe("purpleEffect filter", () => {
	// Morcego do Teto Negro: purpleEffect = Ruptura da Cura (healBlock, on_enter_room, heroes)
	const morcego: EnemyState = {
		id: "e1",
		cardId: "creature_black_ceiling_bat",
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
	};

	it("purpleEffect NÃO dispara quando despertar é 3 (Vermelho)", () => {
		const state = {
			...createInitialGameState(config),
			despertar: 3 as const,
			activeEnemies: [morcego],
			heroes: [
				{
					id: "h1",
					cardId: "hero_crimson_barbarian",
					cardName: "Bárbaro Rubro",
					maxLife: 10,
					currentLife: 10,
					damage: 3,
					hitBonus: 1,
					dice: 2,
					impeto: 0 as const,
					activeItems: {},
					backpack: [],
					usedPowers: {},
					conditions: [],
					status: "active" as const,
					playerIndex: 0,
					xp: 0,
				},
			],
		};
		const result = fireTrigger(state, "evt_room_enter", {
			triggeredBy: "evt_room_enter",
		});
		expect(result.heroes[0].healBlocked).toBeFalsy();
	});

	it("purpleEffect DISPARA quando despertar é 4 (Roxo)", () => {
		const state = {
			...createInitialGameState(config),
			despertar: 4 as const,
			activeEnemies: [morcego],
			heroes: [
				{
					id: "h1",
					cardId: "hero_crimson_barbarian",
					cardName: "Bárbaro Rubro",
					maxLife: 10,
					currentLife: 10,
					damage: 3,
					hitBonus: 1,
					dice: 2,
					impeto: 0 as const,
					activeItems: {},
					backpack: [],
					usedPowers: {},
					conditions: [],
					status: "active" as const,
					playerIndex: 0,
					xp: 0,
				},
			],
		};
		// DSL-migrated skills push to EffectStack; drain to get final state
		const result = drainStack(
			fireTrigger(state, "evt_room_enter", { triggeredBy: "evt_room_enter" }),
		);
		expect(result.heroes[0].healBlocked).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { fireTrigger } from "../dispatch";
import { createInitialGameState } from "../../state/gameState";
import { createEmptyCombatState } from "../../state/combatState";
import type { GameConfig } from "../../state/gameState";
import type { EnemyState } from "../../state/enemyState";
// Importar handlers para que healBlock e outros sejam registrados no registry
import "../handlers/index";

const config: GameConfig = { heroCardNames: ["Bárbaro Rubro"] };

describe("fireTrigger", () => {
	it("retorna o estado inalterado quando não há handlers registrados", () => {
		const state = createInitialGameState(config);
		const result = fireTrigger(state, "before_attack", { triggeredBy: "before_attack" });
		// Sem handlers, o estado deve ser idêntico
		expect(result.eventLog).toEqual(state.eventLog);
	});

	it("não explode quando chamado sem heróis ativos", () => {
		const state = createInitialGameState(config);
		expect(() =>
			fireTrigger(state, "start_of_combat", { triggeredBy: "start_of_combat" }),
		).not.toThrow();
	});

	it("não explode quando chamado com combate ativo mas sem inimigos", () => {
		const state = {
			...createInitialGameState(config),
			combat: createEmptyCombatState(),
		};
		expect(() =>
			fireTrigger(state, "after_roll", { triggeredBy: "after_roll" }),
		).not.toThrow();
	});
});

// ── Filtro de purpleEffect (F1 do patch-8) ────────────────────────────────────

describe("purpleEffect filter", () => {
	// Morcego do Teto Negro: purpleEffect = Ruptura da Cura (healBlock, on_enter_room, heroes)
	const morcego: EnemyState = {
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
	};

	it("purpleEffect NÃO dispara quando despertar é 3 (Vermelho)", () => {
		const state = {
			...createInitialGameState(config),
			despertar: 3 as const,
			activeEnemies: [morcego],
			heroes: [
				{
					id: "h1", cardName: "Bárbaro Rubro", maxLife: 10, currentLife: 10,
					damage: 3, hitBonus: 1, dice: 2, impeto: 0 as const,
					activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active" as const,
					playerIndex: 0, xp: 0,
				},
			],
		};
		const result = fireTrigger(state, "on_enter_room", { triggeredBy: "on_enter_room" });
		expect(result.heroes[0].healBlocked).toBeFalsy();
	});

	it("purpleEffect DISPARA quando despertar é 4 (Roxo)", () => {
		const state = {
			...createInitialGameState(config),
			despertar: 4 as const,
			activeEnemies: [morcego],
			heroes: [
				{
					id: "h1", cardName: "Bárbaro Rubro", maxLife: 10, currentLife: 10,
					damage: 3, hitBonus: 1, dice: 2, impeto: 0 as const,
					activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active" as const,
					playerIndex: 0, xp: 0,
				},
			],
		};
		const result = fireTrigger(state, "on_enter_room", { triggeredBy: "on_enter_room" });
		expect(result.heroes[0].healBlocked).toBe(true);
	});
});

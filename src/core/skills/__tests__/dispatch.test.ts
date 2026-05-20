import { describe, expect, it } from "vitest";
import { fireTrigger } from "../dispatch";
import { createInitialGameState } from "../../state/gameState";
import { createEmptyCombatState } from "../../state/combatState";
import type { GameConfig } from "../../state/gameState";

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

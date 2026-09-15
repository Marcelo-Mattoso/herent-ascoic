import { describe, expect, it } from "vitest";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import { collectTriggerCandidates, fireTrigger } from "./engine";

function stateWithBarbarianAndDagger(): GameState {
	return {
		...createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		}),
		heroes: [
			{
				id: "h1",
				cardId: "hero_crimson_barbarian",
				maxLife: 12,
				currentLife: 12,
				damage: 4,
				hitBonus: 5,
				dice: 1,
				impeto: 0,
				activeItems: { weapon: "item_rusty_dagger" },
				backpack: [],
				usedPowers: {},
				conditions: [],
				status: "active",
				playerIndex: 0,
				xp: 0,
			},
		],
	};
}

describe("trigger engine", () => {
	it("coleta triggers de qualquer fonte em jogo para a mesma janela", () => {
		const candidates = collectTriggerCandidates(
			stateWithBarbarianAndDagger(),
			"evt_attack_declared",
		);

		expect(candidates.map((c) => c.definition.id)).toEqual([
			"item_skill_deadly_edge",
			"skill_crimson_fury",
		]);
		expect(candidates.map((c) => c.source.kind)).toEqual(["item", "hero"]);
		expect(candidates.every((c) => c.window === "before_attack_roll")).toBe(
			true,
		);
		expect(candidates.map((c) => c.mode)).toEqual(["auto", "prompt"]);
	});

	it("habilidade reativa de herói sempre pede aprovação", () => {
		const state = stateWithBarbarianAndDagger();
		const result = fireTrigger(state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
		});

		expect(result.pendingTriggerInterrupt).toMatchObject({
			skillId: "skill_crimson_fury",
			sourceKind: "hero",
			sourceCardId: "hero_crimson_barbarian",
			sourceHeroId: "h1",
			window: "before_attack_roll",
		});
	});

	it("não oferece habilidade de ataque do herói durante ataque inimigo", () => {
		const result = fireTrigger(stateWithBarbarianAndDagger(), "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceEnemyId: "e1",
		});

		expect(result.pendingTriggerInterrupt).toBeUndefined();
	});

	it("pausa em uma interrupção quando o trigger é prompt", () => {
		const state = stateWithBarbarianAndDagger();
		const candidate = collectTriggerCandidates(
			state,
			"evt_attack_declared",
		).find((c) => c.definition.id === "item_skill_deadly_edge");
		expect(candidate).toBeDefined();
		if (!candidate) return;

		const originalInterrupt = candidate.definition.interrupt;
		(
			candidate.definition as {
				interrupt?: { mode?: "auto" | "prompt" | "passive"; prompt?: string };
			}
		).interrupt = {
			mode: "prompt",
			prompt: "A Adaga Enferrujada pode alterar esta rolagem.",
		};

		try {
			const result = fireTrigger(state, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
			});

			expect(result.pendingTriggerInterrupt).toMatchObject({
				skillId: "item_skill_deadly_edge",
				sourceKind: "item",
				sourceCardId: "item_rusty_dagger",
				sourceHeroId: "h1",
				window: "before_attack_roll",
				reason: "A Adaga Enferrujada pode alterar esta rolagem.",
			});
		} finally {
			(
				candidate.definition as {
					interrupt?: typeof originalInterrupt;
				}
			).interrupt = originalInterrupt;
		}
	});
});

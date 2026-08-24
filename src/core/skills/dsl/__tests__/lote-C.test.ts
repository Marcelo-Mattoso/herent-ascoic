// Testes de aceite Lote C (patch-21) — $each itera sobre affect_scope.
import { describe, expect, it } from "vitest";
import { drainStack } from "../../../effects/resolver";
import { buildScriptCtx } from "../../../scripts/context";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { evaluate } from "../evaluate";

function makeHero(id: string, life = 10): HeroState {
	return {
		id,
		cardId: "hero_crimson_barbarian",
		maxLife: life,
		currentLife: life,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
}

describe("$each — iteração sobre affect_scope", () => {
	it("$each em scp_party_full itera sobre todos os heróis ativos", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const h1 = makeHero("h1");
		const h2 = makeHero("h2");
		const state = { ...base, heroes: [h1, h2] };

		// Popula targetIds com todos os heróis (simula dispatcher com scp_party_full)
		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "evt_combat_start", targetHeroIds: ["h1", "h2"] },
			{},
		);

		const result = drainStack(
			evaluate(
				[
					{
						kind: "i_for_each",
						over: "all_heroes",
						as: "$each",
						do: [{ kind: "i_damage", to: "$target", amount: 1 }],
					},
				],
				ctx,
			),
		);

		// Ambos heróis devem ter sofrido 1 de dano
		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(9);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(9);
	});

	it("$each em over resolve para targetIds (scp_single — só h1)", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const h1 = makeHero("h1");
		const h2 = makeHero("h2");
		const state = { ...base, heroes: [h1, h2] };

		const ctx = buildScriptCtx(
			state,
			{ triggeredBy: "evt_combat_start", targetHeroIds: ["h1"] },
			{},
		);

		// $each em over itera sobre targetIds (h1 apenas)
		const result = drainStack(
			evaluate(
				[
					{
						kind: "i_for_each",
						over: "$each",
						as: "$loopHero",
						do: [{ kind: "i_damage", to: "$target", amount: 2 }],
					},
				],
				ctx,
			),
		);

		expect(result.heroes.find((h) => h.id === "h1")?.currentLife).toBe(8);
		expect(result.heroes.find((h) => h.id === "h2")?.currentLife).toBe(10);
	});
});

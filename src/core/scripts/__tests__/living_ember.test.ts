// Testes do script skill_living_ember_oil (Frasco de Óleo Incendiário).
// Fase 7: migrado de handleScript(type="script") para getScript("skill_living_ember_oil.run").

import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState } from "../../state/gameState";

const goblin: EnemyState = {
	id: "e_goblin",
	cardId: "creature_dark_cave_goblin",
	cardName: "Goblin das Cavernas Escuras",
	maxLife: 4,
	currentLife: 4,
	damage: 1,
	hitBonus: 0,
	dice: 1,
	tokens: {},
	conditions: [],
	firstDamageTakenThisTurn: false,
	status: "active",
};

const slime: EnemyState = {
	id: "e_slime",
	cardId: "creature_wet_stone_slime",
	cardName: "Limo das Pedras Úmidas",
	maxLife: 6,
	currentLife: 6,
	damage: 1,
	hitBonus: 0,
	dice: 1,
	tokens: {},
	conditions: [],
	firstDamageTakenThisTurn: false,
	status: "active",
};

function runScript(
	state: ReturnType<typeof createInitialGameState>,
	skillCtx: SkillContext,
) {
	const fn = getScript("skill_living_ember_oil.run");
	if (!fn)
		throw new Error("script skill_living_ember_oil não encontrado no registry");
	return fn(buildScriptCtx(state, skillCtx));
}

describe("skill_living_ember_oil — Frasco de Óleo Incendiário", () => {
	it("enfileira apply_damage 2 contra criatura comum", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };
		const next = runScript(state, {
			triggeredBy: "on_use",
			targetEnemyIds: ["e_goblin"],
		});
		expect(next.effectStack.pending).toHaveLength(1);
		expect(next.effectStack.pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_goblin",
			amount: 2,
		});
		expect(
			next.activeEnemies.find((e) => e.id === "e_goblin")?.currentLife,
		).toBe(4);
	});

	it("enfileira apply_damage 3 contra criatura com Corpo Gelatinoso", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [slime] };
		const next = runScript(state, {
			triggeredBy: "on_use",
			targetEnemyIds: ["e_slime"],
		});
		expect(next.effectStack.pending).toHaveLength(1);
		expect(next.effectStack.pending[0]!.effect).toMatchObject({
			kind: "i_damage",
			to: "e_slime",
			amount: 3,
		});
	});

	it("enfileira com source = skillId correto", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };
		const next = runScript(state, {
			triggeredBy: "on_use",
			skillId: "skill_living_ember_oil",
			targetEnemyIds: ["e_goblin"],
		});
		expect(next.effectStack.pending[0]?.source).toBe("skill_living_ember_oil");
	});

	it("retorna state inalterado se não há alvo", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const next = runScript(base, { triggeredBy: "on_use" });
		expect(next).toBe(base);
	});
});


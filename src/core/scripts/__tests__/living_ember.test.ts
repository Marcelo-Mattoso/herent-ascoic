// Testes do script livingEmber (Frasco de Óleo Incendiário).
// Valida comportamento condicional: 2 de dano normal, 3 contra Corpo Gelatinoso.
//
// Fase 2: script agora usa action.pushEffect → verifica EffectStack, não currentLife.
// O dano é drenado pela engine (drainStack) após o script — fora do escopo deste teste.

import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { handleScript } from "../../skills/handlers/script";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState } from "../../state/gameState";

// Garante que o handler "script" está registrado
import "../../skills/handlers/index";

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

function makeCtx(enemyId: string): SkillContext {
	return { triggeredBy: "on_use", targetEnemyIds: [enemyId] };
}

describe("livingEmber — Frasco de Óleo Incendiário", () => {
	it("enfileira apply_damage 2 contra criatura comum", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };

		const next = handleScript(state, makeCtx("e_goblin"), "item_incendiary_oil_flask.livingEmber");

		// Dano enfileirado na stack — não aplicado imediatamente (pipeline Fase 2)
		expect(next.effectStack.pending).toHaveLength(1);
		const pending = next.effectStack.pending[0]!;
		expect(pending.effect).toMatchObject({ kind: "apply_damage", to: "e_goblin", amount: 2 });
		// currentLife inalterado (drenado depois pela engine)
		const enemy = next.activeEnemies.find((e) => e.id === "e_goblin");
		expect(enemy?.currentLife).toBe(4);
	});

	it("enfileira apply_damage 3 contra criatura com Corpo Gelatinoso", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [slime] };

		const next = handleScript(state, makeCtx("e_slime"), "item_incendiary_oil_flask.livingEmber");

		expect(next.effectStack.pending).toHaveLength(1);
		const pending = next.effectStack.pending[0]!;
		expect(pending.effect).toMatchObject({ kind: "apply_damage", to: "e_slime", amount: 3 });
		expect(next.activeEnemies.find((e) => e.id === "e_slime")?.currentLife).toBe(6);
	});

	it("enfileira com source = skillId correto", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };
		const ctx: SkillContext = { triggeredBy: "on_use", skillId: "skill_living_ember_oil", targetEnemyIds: ["e_goblin"] };

		const next = handleScript(state, ctx, "item_incendiary_oil_flask.livingEmber");

		expect(next.effectStack.pending[0]?.source).toBe("skill_living_ember_oil");
	});

	it("retorna state inalterado se não há alvo", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const ctx: SkillContext = { triggeredBy: "on_use" };

		const next = handleScript(base, ctx, "item_incendiary_oil_flask.livingEmber");
		expect(next).toBe(base);
	});
});

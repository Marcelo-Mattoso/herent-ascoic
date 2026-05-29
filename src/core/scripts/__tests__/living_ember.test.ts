// Testes end-to-end do script livingEmber (Frasco de Óleo Incendiário).
// Valida o comportamento condicional: 2 de dano normal, 3 contra Corpo Gelatinoso.

import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { handleScript } from "../../skills/handlers/script";
import type { EnemyState } from "../../state/enemyState";
import { createInitialGameState } from "../../state/gameState";

// Garante que o handler "script" está registrado
import "../../skills/handlers/index";

// Criatura comum (sem Corpo Gelatinoso)
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

// Criatura com Corpo Gelatinoso
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
	it("causa 2 de dano a criatura comum", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };

		const next = handleScript(
			state,
			makeCtx("e_goblin"),
			"item_incendiary_oil_flask.livingEmber",
		);

		const enemy = next.activeEnemies.find((e) => e.id === "e_goblin");
		expect(enemy?.currentLife).toBe(4 - 2);
	});

	it("causa 3 de dano a criatura com Corpo Gelatinoso", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [slime] };

		const next = handleScript(
			state,
			makeCtx("e_slime"),
			"item_incendiary_oil_flask.livingEmber",
		);

		const enemy = next.activeEnemies.find((e) => e.id === "e_slime");
		expect(enemy?.currentLife).toBe(6 - 3);
	});

	it("registra entrada no eventLog", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const state = { ...base, activeEnemies: [goblin] };

		const next = handleScript(
			state,
			makeCtx("e_goblin"),
			"item_incendiary_oil_flask.livingEmber",
		);

		const lastLog = next.eventLog[next.eventLog.length - 1];
		expect(lastLog).toContain("Goblin das Cavernas Escuras");
		expect(lastLog).toContain("2");
	});

	it("retorna state inalterado se não há alvo", () => {
		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const ctx: SkillContext = { triggeredBy: "on_use" }; // sem targetEnemyIds

		const next = handleScript(
			base,
			ctx,
			"item_incendiary_oil_flask.livingEmber",
		);
		expect(next).toBe(base);
	});
});

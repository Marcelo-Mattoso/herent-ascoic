import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settledWith } from "@/core/__tests__/fixtures";
import { createEmptyCombatState } from "@/core/state/combatState";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { enemiesOf, heroesOf } from "@/core/state/access";
import { withGame, gameOf } from "@/engine/state";
import { applyPoisonStatus, resolvePoisonRound } from "./poison";
import { applyDamageOverTimeStatus, resolveDamageOverTimeRound, clearDamageOverTime } from "./damageOverTime";

function scene(heart = false, boss = true): GameState {
	return settledWith(createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] }), {
		status: "BOSS_COMBAT",
		bossCardId: boss ? "boss_great_cauldron_witch" : "boss_azhakar",
		groupArtifacts: heart ? [{ cardId: "artifact_corrupted_forest_heart", carriedBy: null }] : [],
		heroes: [{ id: "h1", cardId: "hero_crimson_barbarian",
			maxLife: 30, currentLife: 30, damage: 3, hitBonus: 0, dice: 2,
			activeItems: {}, backpack: [], usedPowers: {}, conditions: [],
			status: "active", playerIndex: 0, xp: 0 }],
		activeEnemies: [{ id: "boss", cardId: boss ? "boss_great_cauldron_witch" : "boss_azhakar",
			maxLife: 30, currentLife: 30, damage: 5, hitBonus: 0, dice: 3,
			tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active" }],
		combat: createEmptyCombatState(),
	});
}
function round(s: GameState, n: number): GameState {
	return withGame(s, (game) => ({ ...game, combat: { ...game.combat!, round: n } }));
}

describe("veneno legado, DoT e Coração Corrompido", () => {
	it("reaplicar veneno renova duração sem adiar ticks das rodadas futuras", () => {
		let s = applyPoisonStatus(scene(), "h1", 1, 2);
		s = applyPoisonStatus(round(s, 1), "h1", 1, 2);
		s = resolvePoisonRound(testEngine, s);
		expect(heroesOf(s)[0]?.currentLife).toBe(29);
		expect(gameOf(s).poisonTelemetry?.toHeroes).toBe(1);
		s = applyPoisonStatus(round(s, 2), "h1", 1, 2);
		s = resolvePoisonRound(testEngine, s);
		expect(heroesOf(s)[0]?.currentLife).toBe(28);
		expect(gameOf(s).poisonTelemetry?.toHeroes).toBe(2);
	});

	it("Coração reduz veneno da Bruxa até zero e contabiliza PV evitados", () => {
		let s = applyPoisonStatus(scene(true), "h1", 1, 2);
		s = resolvePoisonRound(testEngine, round(s, 1));
		expect(heroesOf(s)[0]?.currentLife).toBe(30);
		expect(gameOf(s).poisonTelemetry).toMatchObject({
			toHeroes: 0, toEnemies: 0, preventedByHeart: 1,
		});
	});

	it("o Coração não protege contra veneno de outro chefe", () => {
		let s = applyPoisonStatus(scene(true, false), "h1", 2, 2);
		s = resolvePoisonRound(testEngine, round(s, 1));
		expect(heroesOf(s)[0]?.currentLife).toBe(28);
		expect(gameOf(s).poisonTelemetry?.toHeroes).toBe(2);
		expect(gameOf(s).poisonTelemetry?.preventedByHeart ?? 0).toBe(0);
	});

	it("reduz cada stack de veneno genérico de modo independente", () => {
		let s = scene(true);
		for (const effectId of ["a", "b"]) {
			s = applyDamageOverTimeStatus(s, "h1", {
				status: "poison", sourceId: "boss", effectId, damage: 2, rounds: 2,
			});
		}
		s = resolveDamageOverTimeRound(testEngine, round(s, 1));
		expect(heroesOf(s)[0]?.currentLife).toBe(28);
		expect(gameOf(s).poisonTelemetry).toMatchObject({
			toHeroes: 2, toEnemies: 0, preventedByHeart: 2,
		});
	});

	it("limpa venenos antigos e novos quando o combate termina", () => {
		let s = applyPoisonStatus(scene(), "h1", 1, 2);
		s = applyDamageOverTimeStatus(s, "boss", {
			status: "poison", sourceId: "h1", effectId: "knife", damage: 1, rounds: 2,
		});
		s = clearDamageOverTime(s);
		expect(heroesOf(s)[0]?.conditions.some((entry) => entry.startsWith("poison:"))).toBe(false);
		expect(enemiesOf(s)[0]?.conditions.some((entry) => entry.startsWith("dot:v1:"))).toBe(false);
	});

	it("conta a perda real de vida por veneno nos inimigos", () => {
		let s = applyPoisonStatus(scene(true), "boss", 2, 2);
		s = resolvePoisonRound(testEngine, round(s, 1));
		expect(enemiesOf(s)[0]?.currentLife).toBe(28);
		expect(gameOf(s).poisonTelemetry).toMatchObject({
			toHeroes: 0, toEnemies: 2, preventedByHeart: 0,
		});
	});
});

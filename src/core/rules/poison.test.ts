import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settledWith } from "@/core/__tests__/fixtures";
import { createEmptyCombatState } from "@/core/state/combatState";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { enemiesOf, heroesOf, withUnitStats } from "@/core/state/access";
import { withGame, gameOf } from "@/engine/state";
import { applyPoisonStatus, resolvePoisonRound } from "./poison";
import { applyDamageOverTimeStatus, resolveDamageOverTimeRound, clearDamageOverTime } from "./damageOverTime";
import { handleBossResolveAttack } from "../reducer/boss";

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

/** Percorre o fluxo real de ataque e encerramento de rodada do chefe. */
function bossTurn(state: GameState): GameState {
	const withRoll = withGame(state, (game) => ({
		...game,
		combat: {
			...game.combat!,
			phase: "resolving" as const,
			lastRoll: {
				heroId: "h1",
				enemyId: "boss",
				heroResults: [1],
				heroTotal: 1,
				heroBreakdown: [],
				enemyResults: [2],
				enemyTotal: 2,
				enemyBreakdown: [],
			},
		},
	}));
	return handleBossResolveAttack(testEngine, withRoll);
}

describe("veneno legado, DoT e Coração Corrompido", () => {
	it("a própria Bruxa aplica Fumaça no fim da rodada e causa dano na seguinte", () => {
		const source = "boss_great_cauldron_witch/witch_boss_skill_poison_fumes";
		let s = bossTurn(scene());
		expect(gameOf(s).status).toBe("BOSS_COMBAT");
		expect(gameOf(s).poisonTelemetry?.applicationsBySource?.[source]).toBe(1);
		expect(heroesOf(s)[0]?.conditions.some((condition) => condition.startsWith("poison:"))).toBe(true);
		expect(gameOf(s).poisonTelemetry?.witchBossPoisonTicks ?? 0).toBe(0);
		s = bossTurn(s);
		expect(gameOf(s).poisonTelemetry?.applicationsBySource?.[source]).toBe(2);
		expect(gameOf(s).poisonTelemetry?.damageBySource?.[source]?.toHeroes).toBe(1);
		expect(gameOf(s).poisonTelemetry?.witchBossPoisonTicks).toBe(1);
		expect(gameOf(s).poisonTelemetry?.preventedByHeart).toBe(0);
	});

	it("no combate real, o Coração bloqueia a Fumaça da Bruxa sem bloquear o ataque", () => {
		const source = "boss_great_cauldron_witch/witch_boss_skill_poison_fumes";
		let without = bossTurn(bossTurn(scene()));
		let withHeart = bossTurn(bossTurn(scene(true)));
		expect(gameOf(withHeart).poisonTelemetry?.applicationsBySource?.[source]).toBe(2);
		expect(gameOf(withHeart).poisonTelemetry?.toHeroes ?? 0).toBe(0);
		expect(gameOf(withHeart).poisonTelemetry?.preventedByHeart).toBe(1);
		expect(gameOf(withHeart).poisonTelemetry?.heartHeldAtWitchBossTicks).toBe(1);
		// Ambas as partidas sofreram os mesmos ataques. A diferença é só o tick de veneno.
		expect(heroesOf(withHeart)[0]!.currentLife - heroesOf(without)[0]!.currentLife).toBe(1);
	});

	describe("regressões unitárias do efeito", () => {
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

	it("identifica a habilidade da Bruxa que aplicou e causou dano", () => {
		let s = applyPoisonStatus(scene(), "h1", 2, 2, {
			sourceId: "boss", effectId: "witch_boss_skill_poison_fumes",
		});
		s = resolvePoisonRound(testEngine, round(s, 1));
		const key = "boss_great_cauldron_witch/witch_boss_skill_poison_fumes";
		expect(gameOf(s).poisonTelemetry?.damageBySource?.[key]).toEqual({
			toHeroes: 2, toEnemies: 0, ticks: 1,
		});
		expect(gameOf(s).poisonTelemetry?.applicationsBySource?.[key]).toBe(1);
		expect(gameOf(s).poisonTelemetry?.witchBossPoisonTicks).toBe(1);
		expect(gameOf(s).poisonTelemetry?.heartHeldAtWitchBossTicks).toBe(0);
	});

	it("atribui a remoção ao antídoto, sem contar renovação como remoção", () => {
		let s = applyPoisonStatus(scene(), "h1", 1, 2, {
			sourceId: "boss", effectId: "witch_boss_skill_poison_fumes",
		});
		s = applyPoisonStatus(round(s, 1), "h1", 1, 2, {
			sourceId: "boss", effectId: "witch_boss_skill_poison_fumes",
		});
		expect(gameOf(s).poisonTelemetry?.removalsBySource ?? {}).toEqual({});
		s = withUnitStats(s, "h1", { conditions: [] }, {
			reason: "antidote", by: "item_swamp_antidote/witch_item_swamp_antidote_action",
		});
		const key = "antidote | item_swamp_antidote/witch_item_swamp_antidote_action | " +
			"boss_great_cauldron_witch/witch_boss_skill_poison_fumes";
		expect(gameOf(s).poisonTelemetry?.removalsBySource?.[key]).toBe(1);
	});

	it("distingue limpeza de fim de combate de expiração natural", () => {
		let s = applyPoisonStatus(scene(), "h1", 1, 2, {
			sourceId: "boss", effectId: "witch_boss_skill_poison_fumes",
		});
		s = clearDamageOverTime(s);
		const removals = gameOf(s).poisonTelemetry?.removalsBySource ?? {};
		expect(Object.keys(removals)).toContain(
			"combat_end | system | boss_great_cauldron_witch/witch_boss_skill_poison_fumes");
		let expired = applyPoisonStatus(scene(), "h1", 1, 1, {
			sourceId: "boss", effectId: "witch_boss_skill_poison_fumes",
		});
		expired = resolvePoisonRound(testEngine, round(expired, 1));
		expect(Object.keys(gameOf(expired).poisonTelemetry?.removalsBySource ?? {}).some(
			(key) => key.startsWith("expired |"))).toBe(true);
	});

	it("contabiliza oportunidade real de proteção quando o Coração está presente", () => {
		let s = applyDamageOverTimeStatus(scene(true), "h1", {
			status: "poison", sourceId: "boss",
			effectId: "venom_boss", damage: 1, rounds: 2,
		});
		s = resolveDamageOverTimeRound(testEngine, round(s, 1));
		expect(gameOf(s).poisonTelemetry?.witchBossPoisonTicks).toBe(1);
		expect(gameOf(s).poisonTelemetry?.heartHeldAtWitchBossTicks).toBe(1);
		expect(gameOf(s).poisonTelemetry?.preventedByHeart).toBe(1);
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
});

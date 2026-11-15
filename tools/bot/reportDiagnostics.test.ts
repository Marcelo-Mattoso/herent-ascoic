import { describe, expect, it } from "vitest";
import type { BenchmarkTrial, ProgressionTelemetry } from "./dungeonBenchmark";
import { summarizeReportDiagnostics } from "./reportDiagnostics";

function trial(difficulty: BenchmarkTrial["difficulty"], seed = 1,
	outcome = "DEFEAT", progression?: Partial<ProgressionTelemetry>): BenchmarkTrial {
	return {
		seed, repetition: 0, expansionId: "fornalha-sombria",
		heroId: "hero_crimson_barbarian", profile: "power-player",
		difficulty, outcome, violation: null, violationMessage: null,
		steps: 1, roomsCleared: 0, creaturesDefeated: 0,
		bossDefeated: false, artifacts: 0, skillUses: 0, powerUses: 0,
		...(progression ? { progression: progression as ProgressionTelemetry } : {}),
	};
}

describe("diagnósticos P0", () => {
	it("compara dificuldade por seed idêntica e agrega a atividade sem inferir triggers automáticos", () => {
		const summary = summarizeReportDiagnostics([
			trial("hard", 1, "DEFEAT", {
				xpGained: 10, xpSpent: 8, xpOtherLoss: 0, xpFinal: 2,
				levelUpNoEffect: 0, abilityActivity: { preparationsById: { fury: 3 },
					armedById: { fury: 3 }, clearedDuringAttackById: { fury: 2 }, clearedElsewhereById: { fury: 1 },
					manualActionsById: {}, powerActivationsById: {},
					triggersAcceptedById: {}, triggersSkippedById: {} },
			}),
			trial("nightmare", 1, "DEFEAT"),
			trial("normal", 2, "VICTORY"),
		]);
		expect(summary.games).toBe(3);
		expect(summary.poison).toEqual({ toHeroes: 0, toEnemies: 0, preventedByHeart: 0 });
		expect(summary.xpAccountingMismatches).toBe(0);
		expect(summary.difficultyParity).toMatchObject({
			pairedGames: 1, sameOutcome: 1, sameOutcomeRate: 1,
		});
		expect(summary.abilityActivity).toContainEqual(expect.objectContaining({
			abilityId: "fury", preparations: 3, armed: 3, clearedDuringAttack: 2,
			clearedElsewhere: 1, triggersAccepted: 0,
		}));
	});

	it("agrega dano real de veneno por expansão, sem confundir ticks com aplicação", () => {
		const trials = [
			{ ...trial("normal"), poison: { toHeroes: 3, toEnemies: 7, preventedByHeart: 1 } },
			{ ...trial("easy"), expansionId: "torre-grande-bruxa-caldeirao",
				poison: { toHeroes: 8, toEnemies: 0, preventedByHeart: 2 } },
		];
		const result = summarizeReportDiagnostics(trials);
		expect(result.poison).toEqual({ toHeroes: 11, toEnemies: 7, preventedByHeart: 3 });
		expect(result.poisonByExpansion["fornalha-sombria"]).toEqual({
			games: 1, toHeroes: 3, toEnemies: 7, preventedByHeart: 1,
		});
		expect(result.poisonByExpansion["torre-grande-bruxa-caldeirao"]).toEqual({
			games: 1, toHeroes: 8, toEnemies: 0, preventedByHeart: 2,
		});
	});

	it("separa fonte de dano e fonte de remoção, além de entrada no chefe", () => {
		const t: BenchmarkTrial = {
			...trial("normal"),
			poison: {
				toHeroes: 2, toEnemies: 1, preventedByHeart: 1,
				damageBySource: { "boss_great_cauldron_witch/poison_fumes": {
					toHeroes: 2, toEnemies: 1, ticks: 3,
				} },
				removalsBySource: { "cleanse | hero_white_ashes_sister/balm | boss_great_cauldron_witch/poison_fumes": 2 },
				applicationsBySource: { "boss_great_cauldron_witch/poison_fumes": 4 },
				witchBossPoisonTicks: 3, heartHeldAtWitchBossTicks: 1,
			},
			bossEncounter: { roomsCleared: 8, heroLevel: 3, heroLife: 5,
				heroMaxLife: 10, xpAvailable: 2, artifacts: 3, hasCorruptedHeart: true },
			progression: { itemsBoughtWhileLevelAvailable: 1, artifactsBoughtWhileLevelAvailable: 0,
				dungeonRecoveries: 2 } as ProgressionTelemetry,
		};
		const summary = summarizeReportDiagnostics([t]);
		expect(summary.poisonDamageBySource["boss_great_cauldron_witch/poison_fumes"]?.ticks).toBe(3);
		expect(Object.values(summary.poisonRemovalBySource)).toEqual([2]);
		expect(summary.witchBossPoisonTicks).toBe(3);
		expect(summary.heartHeldAtWitchBossTicks).toBe(1);
		expect(summary.bossByExpansion[t.expansionId]).toMatchObject({
			games: 1, reached: 1, heartHeldAtEntry: 1, sumHeroLevel: 3, sumLifeRatio: 0.5,
		});
		expect(summary.xpPolicy).toMatchObject({
			itemsBoughtWhileLevelAvailable: 1, dungeonRecoveries: 2,
		});
	});

	it("agrega salas reais, elites e subchefes e separa chegada ao boss de vitória", () => {
		const base = trial("normal", 7, "VICTORY");
		const t: BenchmarkTrial = {
			...base,
			roomsCleared: 2,
			bossEncounter: { roomsCleared: 2, heroLevel: 3, heroLife: 8,
				heroMaxLife: 10, xpAvailable: 15, artifacts: 3, hasCorruptedHeart: false },
			rooms: {
				room_jailer_room: { entered: 2, cleared: 1, creaturesThreeXpSeen: 3,
					subbossesSeen: 0, subbossesDefeated: 0,
					xpAwardedOnClear: 6, roomCardXpOnClear: 3 },
				subboss_room_jailer_chamber: { entered: 1, cleared: 1, creaturesThreeXpSeen: 0,
					subbossesSeen: 1, subbossesDefeated: 1,
					xpAwardedOnClear: 8, roomCardXpOnClear: 4 },
			},
			progression: { xpGained: 30, xpSpent: 0, xpOtherLoss: 0,
				xpFinal: 30, levelUpNoEffect: 0 } as ProgressionTelemetry,
		};
		const result = summarizeReportDiagnostics([t, t]);
		expect(result.roomsByExpansion[t.expansionId]?.room_jailer_room)
			.toMatchObject({ entered: 4, cleared: 2, creaturesThreeXpSeen: 6, xpAwardedOnClear: 12 });
		expect(result.roomsByExpansion[t.expansionId]?.subboss_room_jailer_chamber)
			.toMatchObject({ entered: 2, subbossesSeen: 2, subbossesDefeated: 2, roomCardXpOnClear: 8 });
		expect(result.heroBalance).toContainEqual(expect.objectContaining({
			heroId: t.heroId, games: 2, victories: 2, bossReached: 2,
			bossVictories: 2, sumBossLifeRatio: 1.6,
		}));
	});

	it("experimento Difícil/Pesadelo registra a mudança real de Despertar e as vitórias pareadas", () => {
		const result = summarizeReportDiagnostics([
			{ ...trial("hard", 1, "VICTORY"), initialDespertar: 1 },
			{ ...trial("nightmare", 1, "DEFEAT"), initialDespertar: 2 },
			{ ...trial("hard", 2, "DEFEAT"), initialDespertar: 1 },
			{ ...trial("nightmare", 2, "VICTORY"), initialDespertar: 2 },
		]);
		expect(result.difficultyParity).toMatchObject({
			pairedGames: 2, sameOutcome: 0, hardWins: 1, nightmareWins: 1,
			hardWinNightmareLoss: 1, nightmareWinHardLoss: 1,
			initialAwakening: { hard: 1, nightmare: 2 },
		});
	});

	it("sinaliza XP incorreto e diferencia falha do bot de derrota", () => {
		const summary = summarizeReportDiagnostics([
			trial("normal", 3, "ERROR", { xpGained: 5, xpSpent: 2,
				xpOtherLoss: 0, xpFinal: 5, levelUpNoEffect: 1 }),
		]);
		expect(summary.errors).toBe(1);
		expect(summary.stalls).toBe(1);
		expect(summary.xpAccountingMismatches).toBe(1);
		expect(summary.ineffectiveLevelUpAttempts).toBe(1);
		expect(summary.warnings.length).toBeGreaterThanOrEqual(3);
		expect(summary.stallsByReason["fornalha-sombria | ERROR"]).toBe(1);
	});
});

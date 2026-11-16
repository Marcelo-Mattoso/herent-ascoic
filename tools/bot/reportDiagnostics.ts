import { BENCHMARK_DIFFICULTIES, classifyTrial, type BenchmarkTrial } from "./dungeonBenchmark";
import type { RoomEncounterTelemetry } from "./encounterTelemetry";

export interface AbilityActivitySummary {
	readonly abilityId: string;
	readonly preparations: number;
	readonly armed: number;
	readonly clearedDuringAttack: number;
	readonly clearedElsewhere: number;
	readonly manualActions: number;
	/** USE_POWER e poderes despachados via USE_SKILL; pode sobrepor preparaçōes. */
	readonly powerActivations: number;
	readonly triggersAccepted: number;
	readonly triggersSkipped: number;
}

export interface AbilityLifecycleDiagnostic {
	readonly abilityId: string;
	readonly attempted: number;
	readonly prepared: number;
	readonly confirmed: number;
	readonly effectsObserved: number;
	readonly chargesConsumed: number;
}

export interface ExpansionParityDiagnostic {
	readonly reference: string;
	readonly comparison: string;
	/** Tolerância indicativa em pontos percentuais absolutos, não desvio relativo. */
	readonly targetGapPercentagePoints: number;
	readonly byDifficulty: readonly {
		readonly difficulty: BenchmarkTrial["difficulty"];
		readonly referenceGames: number;
		readonly comparisonGames: number;
		readonly referenceWinRate: number;
		readonly comparisonWinRate: number;
		readonly referenceStalls: number;
		readonly comparisonStalls: number;
		readonly absoluteGapPercentagePoints: number;
		readonly outsideTarget: boolean | null;
	}[];
}

export interface HeroBalanceDiagnostic {
	readonly expansionId: string;
	readonly heroId: string;
	readonly difficulty: BenchmarkTrial["difficulty"];
	readonly games: number;
	readonly victories: number;
	readonly stalls: number;
	readonly bossReached: number;
	readonly bossVictories: number;
	readonly sumBossLifeRatio: number;
	readonly sumBossLevel: number;
	readonly sumRoomsCleared: number;
	readonly sumXpGained: number;
	readonly abilityOfferedById: Readonly<Record<string, number>>;
	readonly abilityChosenById: Readonly<Record<string, number>>;
	readonly abilityOfferedAtBossById: Readonly<Record<string, number>>;
	readonly abilityChosenAtBossById: Readonly<Record<string, number>>;
}

export interface BenchmarkDiagnostics {
	readonly scope: "solo";
	readonly games: number;
	readonly errors: number;
	readonly stalls: number;
	readonly xpAccountingMismatches: number;
	readonly ineffectiveLevelUpAttempts: number;
	readonly difficultyParity: {
		readonly compared: "hard/nightmare";
		readonly pairedGames: number;
		readonly sameOutcome: number;
		readonly sameOutcomeRate: number | null;
		readonly hardWins: number;
		readonly nightmareWins: number;
		readonly hardWinNightmareLoss: number;
		readonly nightmareWinHardLoss: number;
		readonly initialAwakening: { readonly hard: number | null; readonly nightmare: number | null };
	};
	/** Por expansão e carta: entradas, vitórias, elites de 3 XP e subchefes reais. */
	readonly roomsByExpansion: Readonly<Record<string, Readonly<Record<string, RoomEncounterTelemetry>>>>;
	/** Diagnóstico desagregado de heróis: chegada ao chefe x vitória no chefe. */
	readonly heroBalance: readonly HeroBalanceDiagnostic[];
	readonly abilityActivity: readonly AbilityActivitySummary[];
	/** Ciclo de habilidade: escolha não é confirmação nem efeito. */
	readonly abilityLifecycle: readonly AbilityLifecycleDiagnostic[];
	readonly abilityLifecycleBySource: Readonly<Record<string, Omit<AbilityLifecycleDiagnostic, "abilityId">>>;
	readonly abilityEffectsByTarget: Readonly<Record<string, number>>;
	readonly abilityEffectKinds: Readonly<Record<string, number>>;
	/** Diferença entre base e bruxa por dificuldade, escopo solo. */
	readonly expansionParity: ExpansionParityDiagnostic;
	/** Origem (carta/habilidade) de cada ponto de dano periódico efetivo de veneno. */
	readonly poisonDamageBySource: Readonly<Record<string, { toHeroes: number; toEnemies: number; ticks: number }>>;
	/** Motivo | removedor | origem do status: quantidade de stacks encerrados. */
	readonly poisonRemovalBySource: Readonly<Record<string, number>>;
	readonly poisonApplicationsBySource: Readonly<Record<string, number>>;
	readonly poisonBlockedBySource: Readonly<Record<string, number>>;
	readonly witchBossPoisonTicks: number;
	readonly heartHeldAtWitchBossTicks: number;
	/** Distribuição de gastos e condições reais ao entrar no chefe, separadas por expansão. */
	readonly bossByExpansion: Readonly<Record<string, {
		games: number; reached: number; victoriesAfterArrival: number;
		heartHeldAtEntry: number; sumHeroLevel: number; sumLifeRatio: number;
	}>>;
	/** Impasses por motivo e expansão para localizar o cenário reprodutível. */
	readonly stallsByReason: Readonly<Record<string, number>>;
	readonly xpPolicy: {
		readonly itemsBoughtWhileLevelAvailable: number;
		readonly artifactsBoughtWhileLevelAvailable: number;
		readonly dungeonRecoveries: number;
	};
	/** Pontos de Vida efetivos perdidos por ticks de veneno e prevenção do Coração. */
	readonly poison: { readonly toHeroes: number; readonly toEnemies: number; readonly preventedByHeart: number };
	readonly poisonByExpansion: Readonly<Record<string, {
		readonly games: number;
		readonly toHeroes: number;
		readonly toEnemies: number;
		readonly preventedByHeart: number;
	}>>;
	/** Alertas heurísticos: não equivalem a bugs comprovados. */
	readonly warnings: readonly string[];
}

/**
 * Agrega somente dados já presentes nos trials. Nunca infere que um efeito
 * automático ocorreu só porque o bot preparou a habilidade.
 */
export function summarizeReportDiagnostics(trials: readonly BenchmarkTrial[]): BenchmarkDiagnostics {
	const stats = new Map<string, Omit<AbilityActivitySummary, "abilityId">>();
	type MutableLifecycleCounts = { attempted: number; prepared: number; confirmed: number;
		effectsObserved: number; chargesConsumed: number };
	const lifecycle = new Map<string, MutableLifecycleCounts>();
	const lifecycleBySource: Record<string, MutableLifecycleCounts> = {};
	const effectsByTarget: Record<string, number> = {};
	const effectKinds: Record<string, number> = {};
	const freshLifecycle = () => ({ attempted: 0, prepared: 0, confirmed: 0,
		effectsObserved: 0, chargesConsumed: 0 });
	const tallyLifecycle = (id: string, field: keyof ReturnType<typeof freshLifecycle>, n: number) => {
		const current = lifecycle.get(id) ?? freshLifecycle();
		current[field] += n;
		lifecycle.set(id, current);
	};
	const add = (values: Readonly<Record<string, number>> | undefined,
		field: keyof Omit<AbilityActivitySummary, "abilityId">) => {
		for (const [abilityId, amount] of Object.entries(values ?? {})) {
			const entry = stats.get(abilityId) ?? {
				preparations: 0, armed: 0, clearedDuringAttack: 0, clearedElsewhere: 0,
				manualActions: 0, powerActivations: 0,
				triggersAccepted: 0, triggersSkipped: 0,
			};
			stats.set(abilityId, { ...entry, [field]: entry[field] + amount });
		}
	};
	const poison = { toHeroes: 0, toEnemies: 0, preventedByHeart: 0 };
	const poisonDamageBySource: Record<string, { toHeroes: number; toEnemies: number; ticks: number }> = {};
	const poisonRemovalBySource: Record<string, number> = {};
	const poisonApplicationsBySource: Record<string, number> = {};
	const poisonBlockedBySource: Record<string, number> = {};
	let witchBossPoisonTicks = 0, heartHeldAtWitchBossTicks = 0;
	const bossByExpansion: Record<string, { games: number; reached: number; victoriesAfterArrival: number; heartHeldAtEntry: number; sumHeroLevel: number; sumLifeRatio: number }> = {};
	const xpPolicy = { itemsBoughtWhileLevelAvailable: 0, artifactsBoughtWhileLevelAvailable: 0, dungeonRecoveries: 0 };
	const stallsByReason: Record<string, number> = {};
	const roomsByExpansion: Record<string, Record<string, RoomEncounterTelemetry>> = {};
	const heroBalance = new Map<string, HeroBalanceDiagnostic>();
	const addCounts = (into: Record<string, number>, from?: Readonly<Record<string, number>>) => {
		for (const [key, value] of Object.entries(from ?? {})) into[key] = (into[key] ?? 0) + value;
	};
	const poisonByExpansion: Record<string, { games: number; toHeroes: number; toEnemies: number; preventedByHeart: number }> = {};
	let xpAccountingMismatches = 0;
	let ineffectiveLevelUpAttempts = 0;
	const byCase = new Map<string, Map<string, BenchmarkTrial>>();
	for (const trial of trials) {
		const heroKey = [trial.expansionId, trial.heroId, trial.difficulty].join("|");
		const prior = heroBalance.get(heroKey) ?? {
			expansionId: trial.expansionId, heroId: trial.heroId,
			difficulty: trial.difficulty, games: 0, victories: 0, stalls: 0,
			bossReached: 0, bossVictories: 0, sumBossLifeRatio: 0,
			sumBossLevel: 0, sumRoomsCleared: 0, sumXpGained: 0,
			abilityOfferedById: {}, abilityChosenById: {},
			abilityOfferedAtBossById: {}, abilityChosenAtBossById: {},
		};
		const classification = classifyTrial(trial);
		const atBoss = trial.bossEncounter;
		const mergeAbilities = (old: Readonly<Record<string, number>>,
			next?: Readonly<Record<string, number>>): Record<string, number> => {
			const values: Record<string, number> = { ...old };
			for (const [id, count] of Object.entries(next ?? {}))
				values[id] = (values[id] ?? 0) + count;
			return values;
		};
		heroBalance.set(heroKey, {
			...prior,
			games: prior.games + 1,
			victories: prior.victories + (classification === "victory" ? 1 : 0),
			stalls: prior.stalls + (classification === "stall" ? 1 : 0),
			bossReached: prior.bossReached + (atBoss ? 1 : 0),
			bossVictories: prior.bossVictories + (atBoss && classification === "victory" ? 1 : 0),
			sumBossLifeRatio: prior.sumBossLifeRatio + (atBoss?.heroMaxLife
				? atBoss.heroLife / atBoss.heroMaxLife : 0),
			sumBossLevel: prior.sumBossLevel + (atBoss?.heroLevel ?? 0),
			sumRoomsCleared: prior.sumRoomsCleared + trial.roomsCleared,
			sumXpGained: prior.sumXpGained + (trial.progression?.xpGained ?? 0),
			abilityOfferedById: mergeAbilities(prior.abilityOfferedById, trial.progression?.abilityDecisions?.offeredById),
			abilityChosenById: mergeAbilities(prior.abilityChosenById, trial.progression?.abilityDecisions?.chosenById),
			abilityOfferedAtBossById: mergeAbilities(prior.abilityOfferedAtBossById, trial.progression?.abilityDecisions?.offeredAtBossById),
			abilityChosenAtBossById: mergeAbilities(prior.abilityChosenAtBossById, trial.progression?.abilityDecisions?.chosenAtBossById),
		});
		const roomMap = roomsByExpansion[trial.expansionId] ?? {};
		for (const [roomId, stats] of Object.entries(trial.rooms ?? {})) {
			const prev = roomMap[roomId] ?? {
				entered: 0, cleared: 0, creaturesThreeXpSeen: 0,
				subbossesSeen: 0, subbossesDefeated: 0,
				xpAwardedOnClear: 0, roomCardXpOnClear: 0,
			};
			roomMap[roomId] = {
				entered: prev.entered + stats.entered,
				cleared: prev.cleared + stats.cleared,
				creaturesThreeXpSeen: prev.creaturesThreeXpSeen + stats.creaturesThreeXpSeen,
				subbossesSeen: prev.subbossesSeen + stats.subbossesSeen,
				subbossesDefeated: prev.subbossesDefeated + stats.subbossesDefeated,
				xpAwardedOnClear: prev.xpAwardedOnClear + stats.xpAwardedOnClear,
				roomCardXpOnClear: prev.roomCardXpOnClear + stats.roomCardXpOnClear,
			};
		}
		roomsByExpansion[trial.expansionId] = roomMap;
		if (classification === "stall") {
			const reason = trial.expansionId + " | " + (trial.violation ?? trial.outcome);
			stallsByReason[reason] = (stallsByReason[reason] ?? 0) + 1;
		}
		const expansion = poisonByExpansion[trial.expansionId] ?? {
			games: 0, toHeroes: 0, toEnemies: 0, preventedByHeart: 0,
		};
		expansion.games += 1;
		expansion.toHeroes += trial.poison?.toHeroes ?? 0;
		expansion.toEnemies += trial.poison?.toEnemies ?? 0;
		expansion.preventedByHeart += trial.poison?.preventedByHeart ?? 0;
		poisonByExpansion[trial.expansionId] = expansion;
		poison.toHeroes += trial.poison?.toHeroes ?? 0;
		poison.toEnemies += trial.poison?.toEnemies ?? 0;
		poison.preventedByHeart += trial.poison?.preventedByHeart ?? 0;
		for (const [source, value] of Object.entries(trial.poison?.damageBySource ?? {})) {
			const current = poisonDamageBySource[source] ?? { toHeroes: 0, toEnemies: 0, ticks: 0 };
			current.toHeroes += value.toHeroes;
			current.toEnemies += value.toEnemies;
			current.ticks += value.ticks;
			poisonDamageBySource[source] = current;
		}
		addCounts(poisonRemovalBySource, trial.poison?.removalsBySource);
		addCounts(poisonApplicationsBySource, trial.poison?.applicationsBySource);
		addCounts(poisonBlockedBySource, trial.poison?.blockedBySource);
		witchBossPoisonTicks += trial.poison?.witchBossPoisonTicks ?? 0;
		heartHeldAtWitchBossTicks += trial.poison?.heartHeldAtWitchBossTicks ?? 0;
		const boss = bossByExpansion[trial.expansionId] ?? {
			games: 0, reached: 0, victoriesAfterArrival: 0, heartHeldAtEntry: 0,
			sumHeroLevel: 0, sumLifeRatio: 0,
		};
		boss.games++;
		if (trial.bossEncounter) {
			boss.reached++;
			if (trial.outcome === "VICTORY") boss.victoriesAfterArrival++;
			if (trial.bossEncounter.hasCorruptedHeart) boss.heartHeldAtEntry++;
			boss.sumHeroLevel += trial.bossEncounter.heroLevel;
			boss.sumLifeRatio += trial.bossEncounter.heroMaxLife
				? trial.bossEncounter.heroLife / trial.bossEncounter.heroMaxLife : 0;
		}
		bossByExpansion[trial.expansionId] = boss;
		xpPolicy.itemsBoughtWhileLevelAvailable += trial.progression?.itemsBoughtWhileLevelAvailable ?? 0;
		xpPolicy.artifactsBoughtWhileLevelAvailable += trial.progression?.artifactsBoughtWhileLevelAvailable ?? 0;
		xpPolicy.dungeonRecoveries += trial.progression?.dungeonRecoveries ?? 0;
		const observed = trial.progression?.abilityLifecycle;
		for (const [field, entries] of [
			["attempted", observed?.attemptedById], ["prepared", observed?.preparedById],
			["confirmed", observed?.confirmedById], ["effectsObserved", observed?.effectsObservedById],
			["chargesConsumed", observed?.chargesConsumedById],
		] as const) for (const [id, count] of Object.entries(entries ?? {}))
			tallyLifecycle(id, field, count);
		for (const [source, value] of Object.entries(observed?.bySource ?? {})) {
			const current = lifecycleBySource[source] ?? freshLifecycle();
			for (const field of ["attempted", "prepared", "confirmed", "effectsObserved", "chargesConsumed"] as const)
				current[field] += value[field];
			lifecycleBySource[source] = current;
		}
		addCounts(effectsByTarget, observed?.effectsByTarget);
		addCounts(effectKinds, observed?.effectKindsById);
		const activity = trial.progression?.abilityActivity;
		add(activity?.preparationsById, "preparations");
		add(activity?.armedById, "armed");
		add(activity?.clearedDuringAttackById, "clearedDuringAttack");
		add(activity?.clearedElsewhereById, "clearedElsewhere");
		add(activity?.manualActionsById, "manualActions");
		add(activity?.powerActivationsById, "powerActivations");
		add(activity?.triggersAcceptedById, "triggersAccepted");
		add(activity?.triggersSkippedById, "triggersSkipped");
		const progression = trial.progression;
		if (progression) {
			const rest = progression.xpGained - progression.xpSpent -
				progression.xpOtherLoss - progression.xpFinal;
			if (Math.abs(rest) > 0.001) xpAccountingMismatches++;
			ineffectiveLevelUpAttempts += progression.levelUpNoEffect;
		}
		const key = [trial.expansionId, trial.heroId, trial.profile, trial.seed].join("::");
		const pair = byCase.get(key) ?? new Map<string, BenchmarkTrial>();
		pair.set(trial.difficulty, trial);
		byCase.set(key, pair);
	}
	let pairedGames = 0, sameOutcome = 0;
	let hardWins = 0, nightmareWins = 0, hardWinNightmareLoss = 0, nightmareWinHardLoss = 0;
	let hardInitialAwakening: number | null = null, nightmareInitialAwakening: number | null = null;
	for (const pair of byCase.values()) {
		const hard = pair.get("hard"), nightmare = pair.get("nightmare");
		if (!hard || !nightmare) continue;
		pairedGames++;
		if (classifyTrial(hard) === classifyTrial(nightmare)) sameOutcome++;
		if (classifyTrial(hard) === "victory") hardWins++;
		if (classifyTrial(nightmare) === "victory") nightmareWins++;
		if (classifyTrial(hard) === "victory" && classifyTrial(nightmare) !== "victory") hardWinNightmareLoss++;
		if (classifyTrial(nightmare) === "victory" && classifyTrial(hard) !== "victory") nightmareWinHardLoss++;
		hardInitialAwakening = hard.initialDespertar ?? hardInitialAwakening;
		nightmareInitialAwakening = nightmare.initialDespertar ?? nightmareInitialAwakening;
	}
	const damageAttributed = Object.values(poisonDamageBySource).reduce((sum, row) =>
		sum + row.toHeroes + row.toEnemies, 0);
	const poisonAttributionGap = poison.toHeroes + poison.toEnemies - damageAttributed;
	const errors = trials.filter((entry) => entry.outcome === "ERROR" ||
		entry.violation === "runner_exception").length;
	const stalls = trials.filter((entry) => classifyTrial(entry) === "stall").length;
	const sameOutcomeRate = pairedGames ? sameOutcome / pairedGames : null;
	const parityReference = "fornalha-sombria";
	const parityComparison = "torre-grande-bruxa-caldeirao";
	const targetGapPercentagePoints = 7;
	const parityByDifficulty = BENCHMARK_DIFFICULTIES.map((difficulty) => {
		const reference = trials.filter((trial) => trial.expansionId === parityReference && trial.difficulty === difficulty);
		const comparison = trials.filter((trial) => trial.expansionId === parityComparison && trial.difficulty === difficulty);
		const referenceWinRate = reference.length ? reference.filter((trial) => classifyTrial(trial) === "victory").length / reference.length : 0;
		const comparisonWinRate = comparison.length ? comparison.filter((trial) => classifyTrial(trial) === "victory").length / comparison.length : 0;
		const absoluteGapPercentagePoints = Math.abs(referenceWinRate - comparisonWinRate) * 100;
		// Amostras pequenas não devem produzir um alerta de balanceamento falso.
		return { difficulty, referenceGames: reference.length, comparisonGames: comparison.length,
			referenceWinRate, comparisonWinRate,
			referenceStalls: reference.filter((trial) => classifyTrial(trial) === "stall").length,
			comparisonStalls: comparison.filter((trial) => classifyTrial(trial) === "stall").length,
			absoluteGapPercentagePoints,
			outsideTarget: reference.length >= 100 && comparison.length >= 100
				? absoluteGapPercentagePoints > targetGapPercentagePoints : null };
	});
	const expansionParity: ExpansionParityDiagnostic = {
		reference: parityReference, comparison: parityComparison,
		targetGapPercentagePoints, byDifficulty: parityByDifficulty,
	};
	const warnings: string[] = [];
	for (const row of expansionParity.byDifficulty) if (row.outsideTarget)
		warnings.push(`Base × Bruxa (${row.difficulty}): diferença de ${row.absoluteGapPercentagePoints.toFixed(1)} p.p. supera meta indicativa de ±${targetGapPercentagePoints} p.p. (solo; verificar IA, impasses e amostra antes de balancear cartas)`);
	if (errors) warnings.push(`${errors} partida(s) encerraram por exceção; verificar violationMessage`);
	if (poisonAttributionGap) warnings.push(
		`Dano de veneno sem origem identificada: ${poisonAttributionGap} PV (verificar importação/continuações)`);
	if (poisonDamageBySource["unknown/poison"])
		warnings.push("Ticks de veneno com origem virtual desconhecida; revisar retomada de dano");
	if (stalls) warnings.push(`${stalls} partida(s) em impasse/erro; não contabilizar como derrota comum`);
	if (xpAccountingMismatches) warnings.push(`${xpAccountingMismatches} partida(s) não fecharam a identidade do XP`);
	if (ineffectiveLevelUpAttempts) warnings.push(`${ineffectiveLevelUpAttempts} tentativa(s) de level up sem mudança de nível`);
	if (pairedGames >= 20 && sameOutcomeRate !== null && sameOutcomeRate >= 0.95) {
		warnings.push(`Difícil e Pesadelo tiveram o mesmo resultado em ${(sameOutcomeRate * 100).toFixed(1)}% dos ${pairedGames} pares: investigar se as dificuldades estão suficientemente distintas`);
	}
	return {
		scope: "solo", games: trials.length, errors, stalls,
		xpAccountingMismatches, ineffectiveLevelUpAttempts,
		difficultyParity: { compared: "hard/nightmare", pairedGames, sameOutcome,
			sameOutcomeRate, hardWins, nightmareWins, hardWinNightmareLoss, nightmareWinHardLoss,
			initialAwakening: { hard: hardInitialAwakening, nightmare: nightmareInitialAwakening } },
		roomsByExpansion,
		heroBalance: [...heroBalance.values()].sort((a, b) =>
			a.expansionId.localeCompare(b.expansionId) ||
			a.difficulty.localeCompare(b.difficulty) ||
			a.heroId.localeCompare(b.heroId)),
		poison, poisonByExpansion,
		poisonDamageBySource, poisonRemovalBySource, poisonApplicationsBySource, poisonBlockedBySource,
		witchBossPoisonTicks, heartHeldAtWitchBossTicks, bossByExpansion, xpPolicy, stallsByReason,
		abilityLifecycle: [...lifecycle.entries()].map(([abilityId, values]) =>
			({ abilityId, ...values })).sort((a, b) => a.abilityId.localeCompare(b.abilityId)),
		abilityLifecycleBySource: lifecycleBySource, abilityEffectsByTarget: effectsByTarget,
		abilityEffectKinds: effectKinds, expansionParity,
		abilityActivity: [...stats.entries()].map(([abilityId, summary]) =>
			({ abilityId, ...summary })).sort((a, b) => a.abilityId.localeCompare(b.abilityId)),
		warnings,
	};
}

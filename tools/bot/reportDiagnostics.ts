import { classifyTrial, type BenchmarkTrial } from "./dungeonBenchmark";

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
	};
	readonly abilityActivity: readonly AbilityActivitySummary[];
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
	const addCounts = (into: Record<string, number>, from?: Readonly<Record<string, number>>) => {
		for (const [key, value] of Object.entries(from ?? {})) into[key] = (into[key] ?? 0) + value;
	};
	const poisonByExpansion: Record<string, { games: number; toHeroes: number; toEnemies: number; preventedByHeart: number }> = {};
	let xpAccountingMismatches = 0;
	let ineffectiveLevelUpAttempts = 0;
	const byCase = new Map<string, Map<string, BenchmarkTrial>>();
	for (const trial of trials) {
		if (classifyTrial(trial) === "stall") {
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
	for (const pair of byCase.values()) {
		const hard = pair.get("hard"), nightmare = pair.get("nightmare");
		if (!hard || !nightmare) continue;
		pairedGames++;
		if (classifyTrial(hard) === classifyTrial(nightmare)) sameOutcome++;
	}
	const errors = trials.filter((entry) => entry.outcome === "ERROR" ||
		entry.violation === "runner_exception").length;
	const stalls = trials.filter((entry) => classifyTrial(entry) === "stall").length;
	const sameOutcomeRate = pairedGames ? sameOutcome / pairedGames : null;
	const warnings: string[] = [];
	if (errors) warnings.push(`${errors} partida(s) encerraram por exceção; verificar violationMessage`);
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
			sameOutcomeRate },
		poison, poisonByExpansion,
		poisonDamageBySource, poisonRemovalBySource, poisonApplicationsBySource, poisonBlockedBySource,
		witchBossPoisonTicks, heartHeldAtWitchBossTicks, bossByExpansion, xpPolicy, stallsByReason,
		abilityActivity: [...stats.entries()].map(([abilityId, summary]) =>
			({ abilityId, ...summary })).sort((a, b) => a.abilityId.localeCompare(b.abilityId)),
		warnings,
	};
}

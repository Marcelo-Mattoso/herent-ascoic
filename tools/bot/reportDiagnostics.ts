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
	let xpAccountingMismatches = 0;
	let ineffectiveLevelUpAttempts = 0;
	const byCase = new Map<string, Map<string, BenchmarkTrial>>();
	for (const trial of trials) {
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
		abilityActivity: [...stats.entries()].map(([abilityId, summary]) =>
			({ abilityId, ...summary })).sort((a, b) => a.abilityId.localeCompare(b.abilityId)),
		warnings,
	};
}

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getEnabledExpansions } from "@/core/data/expansions";
import { assertLocalReportExecution, LEVELING_RUNS_ROOT } from "./localLevelingReports";
import { defaultBenchmarkOptions } from "./dungeonBenchmark";
import { writeAudit } from "./skill-audit/run";

export type ExpansionAuditPhase = "opening" | "closing";
export interface ExpansionAuditOptions {
	readonly phase: ExpansionAuditPhase;
	readonly expansion: string;
	readonly runs: number;
	readonly seed: number;
	readonly maxSteps: number;
	readonly dryRun: boolean;
}

function integer(flag: string, value: string | undefined, minimum: number): number {
	const n = Number(value);
	if (!value || !Number.isSafeInteger(n) || n < minimum)
		throw new Error(`${flag} exige inteiro >= ${minimum}`);
	return n;
}

export function parseExpansionAuditArgs(args: readonly string[]): ExpansionAuditOptions {
	const defaults = defaultBenchmarkOptions();
	let phase: ExpansionAuditPhase | undefined;
	let expansion: string | undefined;
	let runs = defaults.runs, seed = defaults.seed, maxSteps = defaults.maxSteps;
	let dryRun = false;
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--") continue;
		if (flag === "--dry-run") { dryRun = true; continue; }
		const value = args[++i];
		switch (flag) {
			case "--phase":
				if (value !== "opening" && value !== "closing") throw new Error("--phase exige opening ou closing");
				phase = value; break;
			case "--expansion": expansion = value; break;
			case "--runs": runs = integer(flag, value, 1); break;
			case "--seed": seed = integer(flag, value, 0); break;
			case "--max-steps": maxSteps = integer(flag, value, 1); break;
			default: throw new Error("Opção desconhecida: " + flag);
		}
	}
	if (!phase || !expansion) throw new Error("Uso: --phase opening|closing --expansion <id> [--runs N] [--seed N] [--max-steps N] [--dry-run]");
	if (!getEnabledExpansions().some((pack) => pack.id === expansion))
		throw new Error("Expansão não habilitada ou inexistente: " + expansion);
	if (seed + runs > 2_147_483_647) throw new Error("Intervalo de seeds inválido");
	return { phase, expansion, runs, seed, maxSteps, dryRun };
}

export function expansionAuditPaths(options: Pick<ExpansionAuditOptions, "expansion" | "phase">) {
	const prefix = `expansion-${options.expansion}-${options.phase}`;
	return {
		skills: path.join(LEVELING_RUNS_ROOT, prefix + "-skills"),
		catalog: path.join(LEVELING_RUNS_ROOT, prefix + "-catalog"),
		leveling: path.join(LEVELING_RUNS_ROOT, prefix + "-leveling"),
		manifest: path.join(LEVELING_RUNS_ROOT, prefix + "-manifest.json"),
	};
}

function runNpm(script: string, args: string[]): void {
	const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm",
		["run", script, "--", ...args], { stdio: "inherit", shell: process.platform === "win32" });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${script} terminou com código ${result.status ?? "desconhecido"}`);
}

interface Snapshot {
	readonly phase: ExpansionAuditPhase;
	readonly expansion: string;
	readonly generatedAt: string;
	readonly configuration: { readonly runs: number; readonly seed: number; readonly maxSteps: number };
	readonly reports: { readonly skills: string; readonly catalog: string; readonly leveling: string };
	readonly skillSummary: Record<string, unknown>;
	readonly levelingSummary: { readonly completed: number; readonly expected: number; readonly outcomes: Record<string, number> };
	readonly limitations: readonly string[];
}

function loadJson(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function results(trials: unknown): Record<string, number> {
	const counts: Record<string, number> = {};
	if (Array.isArray(trials)) for (const trial of trials) {
		const outcome = typeof trial?.outcome === "string" ? trial.outcome : "UNKNOWN";
		counts[outcome] = (counts[outcome] ?? 0) + 1;
	}
	return counts;
}

export function compareSnapshots(initial: Snapshot, final: Snapshot) {
	const comparable = initial.configuration.runs === final.configuration.runs &&
		initial.configuration.seed === final.configuration.seed &&
		initial.configuration.maxSteps === final.configuration.maxSteps;
	const before = initial.levelingSummary.outcomes, after = final.levelingSummary.outcomes;
	const outcomes = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
		.sort().map((key) => [key, { opening: before[key] ?? 0, closing: after[key] ?? 0,
			change: (after[key] ?? 0) - (before[key] ?? 0) }]));
	return {
		comparable,
		note: comparable
			? "Mesma configuração de simulação; comparar também os relatórios por herói, perfil e dificuldade."
			: "Configurações diferentes; diferenças agregadas não devem ser interpretadas como regressão.",
		outcomes,
		skillStructuralFailures: {
			opening: initial.skillSummary.structuralFail ?? null,
			closing: final.skillSummary.structuralFail ?? null,
		},
		skillRuntimeNotCovered: {
			opening: initial.skillSummary.runtimeNotCovered ?? null,
			closing: final.skillSummary.runtimeNotCovered ?? null,
		},
	};
}

export async function runExpansionAudit(args: readonly string[]): Promise<string | null> {
	assertLocalReportExecution();
	const options = parseExpansionAuditArgs(args);
	const paths = expansionAuditPaths(options);
	const cases = defaultBenchmarkOptions();
	const expected = options.runs * cases.heroes.length * cases.expansions.length *
		cases.profiles.length * cases.difficulties.length;
	console.log(`Pacote: ${options.expansion} | fase: ${options.phase} | ${expected} partidas (todas as expansões habilitadas)`);
	console.log("Auditorias: habilidades, catálogo e leveling. Nenhum CI/CD será executado.");
	if (options.dryRun) return null;
	for (const file of [paths.skills, paths.catalog, paths.leveling, paths.manifest])
		if (existsSync(file)) throw new Error("Saída já existe, preservada para comparação: " + file);
	mkdirSync(LEVELING_RUNS_ROOT, { recursive: true });
	await writeAudit(paths.skills);
	runNpm("bot:catalog-report", ["--output", paths.catalog]);
	runNpm("bot:leveling-report", [
		"--output", paths.leveling, "--runs", String(options.runs),
		"--seed", String(options.seed), "--max-steps", String(options.maxSteps),
	]);
	const skill = loadJson(path.join(paths.skills, "report.json"));
	const level = loadJson(path.join(paths.leveling, "report.json"));
	const snapshot: Snapshot = {
		phase: options.phase, expansion: options.expansion, generatedAt: new Date().toISOString(),
		configuration: { runs: options.runs, seed: options.seed, maxSteps: options.maxSteps },
		reports: {
			skills: path.join(paths.skills, "report.json"),
			catalog: path.join(paths.catalog, "report.json"),
			leveling: path.join(paths.leveling, "report.json"),
		},
		skillSummary: skill.summary as Record<string, unknown>,
		levelingSummary: {
			completed: Number(level.completed ?? 0),
			expected: Number(level.expected ?? 0),
			outcomes: results(level.trials),
		},
		limitations: [
			"Auditoria de habilidades atual é estrutural; testes funcionais completos permanecem NOT_COVERED.",
			"Leveling executa apenas cenários solo, com todas as expansões habilitadas; não atesta sinergias de 2–4 heróis.",
			"Resultados dos bots são métricas de simulação, não prova definitiva de balanceamento.",
		],
	};
	writeFileSync(paths.manifest, JSON.stringify(snapshot, null, 2) + "\n");
	if (options.phase === "closing") {
		const openingFile = expansionAuditPaths({ ...options, phase: "opening" }).manifest;
		if (existsSync(openingFile)) {
			const comparison = compareSnapshots(loadJson(openingFile) as unknown as Snapshot, snapshot);
			writeFileSync(path.join(LEVELING_RUNS_ROOT,
				`expansion-${options.expansion}-comparison.json`), JSON.stringify(comparison, null, 2) + "\n");
			console.log("Comparação abertura/fechamento:", JSON.stringify(comparison, null, 2));
		} else console.warn("Sem manifesto de abertura: comparação indisponível.");
	}
	console.log("Manifesto consolidado:", paths.manifest);
	return paths.manifest;
}

if (process.env.VITEST === undefined) runExpansionAudit(process.argv.slice(2)).catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});

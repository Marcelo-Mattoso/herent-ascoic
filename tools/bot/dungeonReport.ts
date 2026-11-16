import fs from "node:fs";
import path from "node:path";
import { getEnabledExpansions } from "@/core/data/expansions";
import { buildCatalogBalance } from "./catalogBalance";
import { assertLocalReportExecution } from "./localLevelingReports";
import { assertSameReportProvenance, reportProvenance } from "./reportProvenance";
import { summarizeReportDiagnostics } from "./reportDiagnostics";
import {
	type BenchmarkTrial,
	type DungeonBenchmarkOptions,
	benchmarkCaseKey,
	benchmarkPlan,
	defaultBenchmarkOptions,
	ensureComparableDungeons,
	runBenchmarkCase,
	summarizeBenchmark,
} from "./dungeonBenchmark";
import type { DungeonReportData } from "./dungeonReportHtml";

interface CliOptions {
	readonly benchmark: DungeonBenchmarkOptions;
	readonly output?: string;
	readonly resume: boolean;
	readonly dryRun: boolean;
}

const RUNS_ROOT = path.resolve("tools/bot/runs");

function nonNegativeInt(flag: string, value: string | undefined, min: number): number {
	const n = Number(value);
	if (!value || !Number.isSafeInteger(n) || n < min)
		throw new Error(`${flag} exige inteiro >= ${min}`);
	return n;
}

export function parseDungeonReportArgs(args: readonly string[]): CliOptions {
	const defaults = defaultBenchmarkOptions();
	let benchmark: DungeonBenchmarkOptions = defaults;
	let output: string | undefined;
	let resume = false;
	let dryRun = false;
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--") continue;
		if (flag === "--resume") { resume = true; continue; }
		if (flag === "--dry-run") { dryRun = true; continue; }
		const value = args[++i];
		switch (flag) {
			case "--runs": benchmark = { ...benchmark, runs: nonNegativeInt(flag, value, 1) }; break;
			case "--seed": benchmark = { ...benchmark, seed: nonNegativeInt(flag, value, 0) }; break;
			case "--max-steps": benchmark = { ...benchmark, maxSteps: nonNegativeInt(flag, value, 1) }; break;
			case "--output": {
				if (!value) throw new Error("--output exige uma pasta em tools/bot/runs");
				output = value; break;
			}
			default: throw new Error(`Parâmetro desconhecido: ${flag}. Veja tools/bot/README.md`);
		}
	}
	if (!benchmark.heroes.length || !benchmark.expansions.length || !benchmark.profiles.length || !benchmark.difficulties.length)
		throw new Error("Catálogo sem heróis, expansões, perfis ou dificuldades habilitados.");
	if (benchmark.seed + benchmark.runs > 2_147_483_647)
		throw new Error("Intervalo de seeds ultrapassa limite seguro");
	if (resume && !output) throw new Error("--resume exige --output <pasta já criada>");
	return { benchmark, output, resume, dryRun };
}

function outputDir(options: CliOptions): string {
	const suffix = new Date().toISOString().replace(/[:.]/g, "-");
	const target = options.output
		? path.resolve(options.output)
		: path.join(RUNS_ROOT, "dungeon-" + suffix);
	if (!target.startsWith(RUNS_ROOT + path.sep))
		throw new Error("Os relatórios devem ficar em tools/bot/runs (fora de Git/public/dist).");
	return target;
}

/**
 * A auditoria rápida ocupa a pasta primeiro; somente esses dois arquivos
 * podem anteceder os checkpoints de uma execução completa.
 */
export function prepareSimulationDirectory(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		return;
	}
	if (!fs.statSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) {
		throw new Error("Pasta de relatório inválida: " + dir);
	}
	const contents = fs.readdirSync(dir).sort();
	if (contents.length !== 2 ||
		contents[0] !== "skill-audit.html" ||
		contents[1] !== "skill-audit.json" ||
		contents.some((name) => !fs.statSync(path.join(dir, name)).isFile() ||
			fs.lstatSync(path.join(dir, name)).isSymbolicLink())) {
		throw new Error("Pasta de relatório já existe: " + dir + ". Use --resume.");
	}
}

function saveReport(dir: string, report: DungeonReportData): void {
	// Only the versioned JSON is the report. config.json and trials.jsonl are
	// private resumable checkpoints, not published report assets.
	fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
}

export function runDungeonReport(args: readonly string[]): string | null {
	assertLocalReportExecution();
	const options = parseDungeonReportArgs(args);
	const { benchmark } = options;
	const plan = benchmarkPlan(benchmark);
	console.log("Ensaio: " + benchmark.runs + " seeds, " + benchmark.heroes.length + " heróis, " +
		benchmark.expansions.length + " expansões, " + benchmark.profiles.length + " perfis, " +
		benchmark.difficulties.length + " dificuldades = " + plan.length + " partidas.");
	const catalogPreview = buildCatalogBalance(benchmark.expansions);
	for (const expansion of catalogPreview.expansions) console.log("  " + expansion.name + ": " +
		expansion.heroes.length + " heróis · " + expansion.creatures.length + " criaturas · " +
		expansion.rooms.length + " salas · " + expansion.items.length + " itens · " +
		expansion.roomsBelowFourEnemies + " salas com menos de 4 inimigos (4 heróis)");
	if (options.dryRun) return null;
	const provenance = reportProvenance(catalogPreview);
	if (!provenance.comparable) console.warn("ATENÇÃO: árvore Git suja ou commit desconhecido; este relatório não é elegível para comparação controlada ou retomada.");
	const dir = outputDir(options);
	const configFile = path.join(dir, "config.json");
	const manifestFile = path.join(dir, "manifest.json");
	const trialFile = path.join(dir, "trials.jsonl");
	if (options.resume) {
		if (!fs.existsSync(configFile)) throw new Error("Configuração não encontrada para retomar: " + configFile);
		const existing = JSON.parse(fs.readFileSync(configFile, "utf8")) as DungeonBenchmarkOptions;
		if (JSON.stringify(existing) !== JSON.stringify(benchmark))
			throw new Error("A configuração de --resume difere da execução original.");
		if (!fs.existsSync(manifestFile)) throw new Error("Checkpoint legado sem proveniência; não é seguro retomar esta execução.");
		const saved = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
		assertSameReportProvenance(saved, provenance);
	} else {
		prepareSimulationDirectory(dir);
		fs.writeFileSync(configFile, JSON.stringify(benchmark, null, 2) + "\n");
		fs.writeFileSync(manifestFile, JSON.stringify(provenance, null, 2) + "\n");
	}

	// Em caso de interrupção, trials.jsonl permite continuar sem repetir partidas.
	const saved: BenchmarkTrial[] = fs.existsSync(trialFile)
		? fs.readFileSync(trialFile, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as BenchmarkTrial)
		: [];
	const byKey = new Map(saved.map((trial) => [benchmarkCaseKey(trial), trial]));
	const allowed = new Set(plan.map(benchmarkCaseKey));
	if (byKey.size !== saved.length || saved.some((trial) => !allowed.has(benchmarkCaseKey(trial))))
		throw new Error("Checkpoint inválido: entradas duplicadas ou fora da matriz esperada.");

	console.log("Verificando a igualdade inicial das masmorras para cada seed...");
	ensureComparableDungeons(benchmark);
	console.log("Masmorras comparáveis dentro de cada expansão: mesmos decks e primeira sala por seed.");

	let completed = byKey.size;
	for (const test of plan) {
		const key = benchmarkCaseKey(test);
		if (byKey.has(key)) continue;
		let trial: BenchmarkTrial;
		try {
			trial = runBenchmarkCase(test, benchmark.maxSteps, benchmark.xpExperiment);
		} catch (error) {
			trial = { ...test, outcome: "ERROR", violation: "runner_exception",
				violationMessage: error instanceof Error ? error.message : String(error),
				steps: 0, roomsCleared: 0, creaturesDefeated: 0, bossDefeated: false,
				artifacts: 0, skillUses: 0, powerUses: 0 };
		}
		fs.appendFileSync(trialFile, JSON.stringify(trial) + "\n");
		byKey.set(key, trial);
		completed++;
		if (completed % 25 === 0 || completed === plan.length) {
			console.log(completed + "/" + plan.length + " partidas; última: " +
				test.expansionId + " · " + test.heroId + " · " + test.profile + " · " + test.difficulty + " · seed " + test.seed);
		}
	}

	const trials = plan.map((test) => byKey.get(benchmarkCaseKey(test))!);
	const report: DungeonReportData & {
		readonly schemaVersion: 1;
		readonly kind: "simulation";
		readonly catalog: ReturnType<typeof buildCatalogBalance>;
	} = {
		schemaVersion: 1,
		kind: "simulation",
		generatedAt: new Date().toISOString(),
		provenance,
		scope: "solo" as const,
		options: benchmark,
		completed: trials.length,
		expected: plan.length,
		trials,
		summaries: summarizeBenchmark(benchmark, trials),
		diagnostics: summarizeReportDiagnostics(trials),
		expansionNames: Object.fromEntries(getEnabledExpansions().map((pack) => [pack.id, pack.name])),
		catalog: catalogPreview,
	};
	saveReport(dir, report);
	console.log("\nRelatório JSON: " + path.join(dir, "report.json"));
	console.log("Abra http://localhost:5173/leveling-report com npm run dev.");
	console.log("Resultados gravados apenas localmente; nada é publicado no site.");
	return dir;
}

if (process.env.VITEST === undefined) runDungeonReport(process.argv.slice(2));

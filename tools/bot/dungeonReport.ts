import fs from "node:fs";
import path from "node:path";
import { BOT_HEROES } from "./play";
import { BOT_PROFILES, parseBotDifficulty, parseBotParty, parseBotProfile } from "./profiles";
import {
	BENCHMARK_DIFFICULTIES,
	type BenchmarkTrial,
	type DungeonBenchmarkOptions,
	benchmarkCaseKey,
	benchmarkPlan,
	defaultBenchmarkOptions,
	ensureComparableDungeons,
	runBenchmarkCase,
	summarizeBenchmark,
} from "./dungeonBenchmark";
import {
	type DungeonReportData,
	renderDungeonReportCsv,
	renderDungeonReportHtml,
	renderDungeonReportMarkdown,
} from "./dungeonReportHtml";

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

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function commaList(flag: string, value: string | undefined): string[] {
	if (!value) throw new Error(`${flag} exige nomes separados por vírgula`);
	const names = value.split(",").map((text) => text.trim());
	if (names.some((name) => !name)) throw new Error(`${flag} não aceita nomes vazios`);
	return names;
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
			case "--heroes": {
				const names = commaList(flag, value);
				const heroes = unique(names.map((name) => parseBotParty(name)[0]!));
				if (heroes.some((hero) => !BOT_HEROES.includes(hero))) throw new Error("Herói desconhecido");
				benchmark = { ...benchmark, heroes }; break;
			}
			case "--profiles": {
				const profiles = unique(commaList(flag, value).map(parseBotProfile));
				benchmark = { ...benchmark, profiles }; break;
			}
			case "--difficulties": {
				const difficulties = unique(commaList(flag, value).map(parseBotDifficulty));
				benchmark = { ...benchmark, difficulties }; break;
			}
			case "--output": {
				if (!value) throw new Error("--output exige uma pasta em tools/bot/runs");
				output = value; break;
			}
			default: throw new Error(`Parâmetro desconhecido: ${flag}. Veja tools/bot/README.md`);
		}
	}
	if (!benchmark.heroes.length || !benchmark.profiles.length || !benchmark.difficulties.length)
		throw new Error("Escolha pelo menos um herói, perfil e dificuldade");
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

function saveReport(dir: string, report: DungeonReportData): void {
	fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
	fs.writeFileSync(path.join(dir, "report.md"), renderDungeonReportMarkdown(report));
	fs.writeFileSync(path.join(dir, "report.csv"), renderDungeonReportCsv(report.trials));
	fs.writeFileSync(path.join(dir, "index.html"), renderDungeonReportHtml(report));
}

export function runDungeonReport(args: readonly string[]): string | null {
	const options = parseDungeonReportArgs(args);
	const { benchmark } = options;
	const plan = benchmarkPlan(benchmark);
	console.log("Ensaio: " + benchmark.runs + " seeds, " + benchmark.heroes.length + " heróis, " +
		benchmark.profiles.length + " perfis, " + benchmark.difficulties.length + " dificuldades = " + plan.length + " partidas.");
	if (options.dryRun) return null;
	const dir = outputDir(options);
	const configFile = path.join(dir, "config.json");
	const trialFile = path.join(dir, "trials.jsonl");
	if (options.resume) {
		if (!fs.existsSync(configFile)) throw new Error("Configuração não encontrada para retomar: " + configFile);
		const existing = JSON.parse(fs.readFileSync(configFile, "utf8")) as DungeonBenchmarkOptions;
		if (JSON.stringify(existing) !== JSON.stringify(benchmark))
			throw new Error("A configuração de --resume difere da execução original.");
	} else {
		if (fs.existsSync(dir)) throw new Error("Pasta de relatório já existe: " + dir + ". Use --resume.");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(configFile, JSON.stringify(benchmark, null, 2) + "\n");
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
	console.log("Masmorras compatíveis: decks e primeira sala são iguais em cada seed.");

	let completed = byKey.size;
	for (const test of plan) {
		const key = benchmarkCaseKey(test);
		if (byKey.has(key)) continue;
		let trial: BenchmarkTrial;
		try {
			trial = runBenchmarkCase(test, benchmark.maxSteps);
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
				test.heroId + " · " + test.profile + " · " + test.difficulty + " · seed " + test.seed);
		}
	}

	const trials = plan.map((test) => byKey.get(benchmarkCaseKey(test))!);
	const report: DungeonReportData = {
		generatedAt: new Date().toISOString(),
		options: benchmark,
		completed: trials.length,
		expected: plan.length,
		trials,
		summaries: summarizeBenchmark(benchmark, trials),
	};
	saveReport(dir, report);
	console.log("\nRelatório visual: " + path.join(dir, "index.html"));
	console.log("Dados: " + path.join(dir, "report.json") + " | report.csv | report.md");
	console.log("Resultados gravados apenas localmente; nada foi publicado no site.");
	return dir;
}

if (process.env.VITEST === undefined) runDungeonReport(process.argv.slice(2));

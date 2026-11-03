import fs from "node:fs";
import path from "node:path";
import { cardName } from "@/core/gameEngine";
import { engine } from "../golden/lib";
import { playAiGame } from "./ai";
import { BOT_HEROES } from "./play";
import { parseBotDifficulty, parseBotParty, parseBotProfile, setupForRun, type BotProfile } from "./profiles";
import type { GoldenSetup } from "../golden/lib";

interface Options {
	mode: "solo" | "team" | "both";
	hero?: string;
	seed: number;
	soloSeeds: number;
	teamSeeds: number;
	maxSteps: number;
	profile: BotProfile;
	difficulty: GoldenSetup["difficulty"];
}

interface Trial {
	mode: "solo" | "team";
	seed: number;
	heroes: readonly string[];
	outcome: string;
	violation: string | null;
	roomsCleared: number;
	steps: number;
}

interface Summary {
	heroId: string;
	games: number;
	wins: number;
	losses: number;
	stalls: number;
	winRate: number;
	low95: number;
	high95: number;
	meanRooms: number;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { mode: "both", seed: 1, soloSeeds: 20, teamSeeds: 3, maxSteps: 1000,
		profile: "power-player", difficulty: "normal" };
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (!value) throw new Error(`${flag} exige um valor`);
		if (flag === "--mode") {
			if (value !== "solo" && value !== "team" && value !== "both")
				throw new Error("--mode exige solo, team ou both");
			opts.mode = value;
		} else if (flag === "--hero") {
			const heroes = parseBotParty(value);
			if (heroes.length !== 1) throw new Error("--hero exige exatamente um herói");
			opts.hero = heroes[0];
		} else if (flag === "--profile") opts.profile = parseBotProfile(value);
		else if (flag === "--difficulty") opts.difficulty = parseBotDifficulty(value);
		else if (["--seed", "--solo-seeds", "--team-seeds", "--max-steps"].includes(flag)) {
			const number = Number(value);
			if (!Number.isInteger(number) || number < (flag === "--seed" ? 0 : 1))
				throw new Error(`${flag} exige um inteiro ${flag === "--seed" ? ">= 0" : ">= 1"}`);
			if (flag === "--seed") opts.seed = number;
			else if (flag === "--solo-seeds") opts.soloSeeds = number;
			else if (flag === "--team-seeds") opts.teamSeeds = number;
			else opts.maxSteps = number;
		} else throw new Error(`flag desconhecida: ${flag}`);
	}
	if (opts.hero && opts.mode !== "solo") throw new Error("--hero exige --mode solo");
	return opts;
}

function combinations<T>(values: readonly T[], count: number): T[][] {
	const result: T[][] = [];
	function collect(start: number, chosen: T[]) {
		if (chosen.length === count) { result.push(chosen); return; }
		for (let index = start; index <= values.length - (count - chosen.length); index++)
			collect(index + 1, [...chosen, values[index]!]);
	}
	collect(0, []);
	return result;
}

function wilson(wins: number, total: number): [number, number] {
	if (!total) return [0, 0];
	const z = 1.96;
	const p = wins / total;
	const denominator = 1 + z * z / total;
	const center = (p + z * z / (2 * total)) / denominator;
	const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
	return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

function summarize(trials: readonly Trial[], mode: Trial["mode"], heroIds: readonly string[]): Summary[] {
	return heroIds.map((heroId) => {
		const games = trials.filter((trial) => trial.mode === mode && trial.heroes.includes(heroId));
		const wins = games.filter((trial) => trial.outcome === "VICTORY" && !trial.violation).length;
		const losses = games.filter((trial) => trial.outcome === "DEFEAT" && !trial.violation).length;
		const [low95, high95] = wilson(wins, games.length);
		return { heroId, games: games.length, wins, losses, stalls: games.length - wins - losses,
			winRate: games.length ? wins / games.length : 0, low95, high95,
			meanRooms: games.length ? games.reduce((sum, trial) => sum + trial.roomsCleared, 0) / games.length : 0 };
	});
}

const opts = parseArgs(process.argv.slice(2));
const heroIds = opts.hero ? [opts.hero] : BOT_HEROES;
const parties = combinations(BOT_HEROES, 3);
const trials: Trial[] = [];
const total = (opts.mode === "team" ? 0 : heroIds.length * opts.soloSeeds) +
	(opts.mode === "solo" ? 0 : parties.length * opts.teamSeeds);
let completed = 0;
console.log(`Balanceamento: ${opts.difficulty}, perfil ${opts.profile}; ${total} partidas ` +
	`(${opts.mode === "team" ? "" : `${heroIds.length} ${heroIds.length === 1 ? "herói" : "heróis"} solo`}` +
	`${opts.mode === "both" ? ", " : ""}` +
	`${opts.mode === "solo" ? "" : `${parties.length} trios`}).`);

function run(mode: Trial["mode"], heroes: readonly string[], seed: number) {
	const setup = setupForRun(seed, heroes, opts.difficulty);
	const result = playAiGame(setup, opts.maxSteps, undefined, opts.profile);
	trials.push({ mode, seed, heroes: [...heroes], outcome: result.outcome,
		violation: result.violation?.invariant ?? null, roomsCleared: result.roomsCleared, steps: result.steps });
	completed++;
	if (completed % 25 === 0 || completed === total) console.log(`${completed}/${total} partidas concluídas`);
}

if (opts.mode !== "team") {
	for (const heroId of heroIds) {
		for (let index = 0; index < opts.soloSeeds; index++) run("solo", [heroId], opts.seed + index);
	}
}
if (opts.mode !== "solo") {
	for (const party of parties) {
		for (let index = 0; index < opts.teamSeeds; index++) run("team", party, opts.seed + index);
	}
}

const solo = summarize(trials, "solo", heroIds);
const team = summarize(trials, "team", BOT_HEROES);
const output = path.resolve("tools/bot/runs", `balance-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify({ options: opts,
	...(opts.mode === "team" ? {} : { solo }),
	...(opts.mode === "solo" ? {} : { parties: parties.length, team }), trials }, null, "\t")}\n`);

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const table = (rows: Summary[]) => [
	"| Herói | Partidas | Vitórias | Derrotas | Impasses | Vitória | IC 95% | Salas médias |",
	"|---|---:|---:|---:|---:|---:|---:|---:|",
	...rows.map((row) => `| ${cardName(engine, row.heroId)} | ${row.games} | ${row.wins} | ${row.losses} | ${row.stalls} | ${percent(row.winRate)} | ${percent(row.low95)}–${percent(row.high95)} | ${row.meanRooms.toFixed(1)} |`),
].join("\n");
const markdown = [
	"# Balanceamento dos heróis",
	"",
	`Perfil: ${opts.profile}; dificuldade: ${opts.difficulty}; seeds a partir de ${opts.seed}; limite de ${opts.maxSteps} ações.`,
	"",
	"A taxa mede o desempenho deste bot nas seeds testadas. Zero vitórias observadas não prova impossibilidade de vencer. Impasses incluem limite de ações e diagnósticos do bot.",
	"",
	...(opts.mode === "team" ? [] : ["## Solo", "", table(solo), ""]),
	...(opts.mode === "solo" ? [] : ["## Equipes de três", "",
		`Cada herói aparece em ${combinations(BOT_HEROES.slice(1), 2).length} composições distintas. Todas as ${parties.length} composições usam as mesmas ${opts.teamSeeds} seeds.`,
		"", table(team), ""]),
	"Os resultados completos por seed e equipe estão em `report.json`.",
	"",
].join("\n");
fs.writeFileSync(path.join(output, "report.md"), markdown);
if (opts.mode !== "team") console.log(`\nSolo\n${table(solo)}`);
if (opts.mode !== "solo") console.log(`\nEquipes de três\n${table(team)}`);
console.log(`\nRelatório: ${output}`);

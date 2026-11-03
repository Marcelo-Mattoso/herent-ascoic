import fs from "node:fs";
import path from "node:path";
import { playerView } from "@/core/projection/playerView";
import { engine, stableStringify } from "../golden/lib";
import {
	type BotReplay,
	type GameResult,
	replayGame,
} from "./play";
import { gameOf } from "@/engine/state";
import { playAiGame } from "./ai";
import { parseBotDifficulty, parseBotParty, parseBotProfile, setupForRun, type BotProfile } from "./profiles";
import type { GoldenSetup } from "../golden/lib";

interface Options {
	games: number;
	seed: number;
	maxSteps: number;
	replay: string | null;
	profile: BotProfile;
	heroes?: string[];
	difficulty?: GoldenSetup["difficulty"];
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { games: 100, seed: 1, maxSteps: 3000, replay: null, profile: "random" };
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = argv[i + 1];
		const num = () => {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 0) {
				throw new Error(`${flag} exige inteiro >= 0`);
			}
			i++;
			return n;
		};
		if (flag === "--games") opts.games = num();
		else if (flag === "--seed") opts.seed = num();
		else if (flag === "--max-steps") opts.maxSteps = num();
		else if (flag === "--profile") {
			if (!value) throw new Error("--profile exige um valor");
			opts.profile = parseBotProfile(value);
			i++;
		} else if (flag === "--heroes") {
			if (!value) throw new Error("--heroes exige heróis separados por vírgula");
			opts.heroes = parseBotParty(value);
			i++;
		} else if (flag === "--difficulty") {
			if (!value) throw new Error("--difficulty exige um valor");
			opts.difficulty = parseBotDifficulty(value);
			i++;
		}
		else if (flag === "--replay") {
			if (!value) throw new Error("--replay exige um arquivo");
			opts.replay = value;
			i++;
		} else throw new Error(`flag desconhecida: ${flag}`);
	}
	return opts;
}

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function saveFailure(dir: string, result: GameResult, maxSteps: number): string {
	const v = result.violation;
	if (!v) throw new Error("saveFailure sem violação");
	const out = path.join(dir, `falha-seed-${result.setup.seed}`);
	fs.mkdirSync(out, { recursive: true });
	const write = (name: string, data: unknown) =>
		fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, "\t")}\n`);
	const replay: BotReplay = {
		format: 1,
		seed: result.setup.seed,
		setup: result.setup,
		maxSteps,
		actions: result.actions,
		violation: v,
	};
	write("replay.json", replay);
	write("violation.json", {
		...v,
		status: gameOf(result.final).status,
		steps: result.actions.length,
	});
	write("state.json", result.final);
	write("view.json", JSON.parse(stableStringify(playerView(engine, result.final))));
	write("eventLog.json", gameOf(result.final).eventLog);
	return out;
}

function runReplay(file: string): number {
	const replay = JSON.parse(fs.readFileSync(file, "utf8")) as BotReplay;
	const result = replayGame(replay);
	console.log(
		`replay seed=${replay.seed} actions=${replay.actions.length} status=${gameOf(result.final).status}`,
	);
	if (replay.violation?.invariant === "boss_stalemate" &&
		result.violation?.invariant === "no_legal_action") {
		const view = playerView(engine, result.final);
		const boss = view.enemies.find((enemy) => enemy.id === "boss" && enemy.status === "active");
		if (boss && (view.combat?.round ?? 0) >= 50) {
			console.log(`DIAGNÓSTICO REPRODUZIDO ${replay.violation.invariant}: ${replay.violation.message}`);
			return 1;
		}
	}
	if (result.violation) {
		console.log(`VIOLAÇÃO ${result.violation.invariant}: ${result.violation.message}`);
		return 1;
	}
	console.log("sem violação");
	return 0;
}

function main(): number {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.replay) return runReplay(opts.replay);

	const dir = path.resolve(__dirname, "runs", timestamp());
	let wins = 0;
	let losses = 0;
	const failures: { seed: number; invariant: string; message: string; dir: string }[] = [];
	const byInvariant: Record<string, number> = {};
	const games: Array<{ seed: number; heroes: readonly string[]; difficulty: string; outcome: string; steps: number; roomsCleared: number; creaturesDefeated: number; abilityUses: Record<string, number>; plannedSkillActions: number; runeFuryHits: number; violation: string | null }> = [];

	for (let i = 0; i < opts.games; i++) {
		const seed = opts.seed + i;
		const setup = setupForRun(seed, opts.heroes, opts.difficulty);
		let plannedSkillActions = 0;
		const ai = playAiGame(setup, opts.maxSteps, (step) => {
			if (step.chosen.plan && step.chosen.action.type === "USE_SKILL") plannedSkillActions++;
		}, opts.profile);
		const result: GameResult = { setup, actions: [...ai.actions], final: ai.final, violation: ai.violation };
		const abilityUses: Record<string, number> = {};
		for (const action of result.actions) {
			if (action.type !== "USE_SKILL") continue;
			abilityUses[action.payload.skillId] = (abilityUses[action.payload.skillId] ?? 0) + 1;
		}
		games.push({ seed, heroes: setup.heroCardIds, difficulty: setup.difficulty,
			outcome: gameOf(result.final).status, steps: result.actions.length,
			roomsCleared: gameOf(result.final).roomsCleared,
			creaturesDefeated: gameOf(result.final).creaturesDefeated,
			abilityUses, plannedSkillActions,
			runeFuryHits: gameOf(result.final).eventLog.filter((entry) =>
				entry.includes("skill_rift_rune") && entry.includes("skill_crimson_fury")).length,
			violation: result.violation?.invariant ?? null });
		if (result.violation) {
			const inv = result.violation.invariant;
			byInvariant[inv] = (byInvariant[inv] ?? 0) + 1;
			const where = saveFailure(dir, result, opts.maxSteps);
			failures.push({ seed, invariant: inv, message: result.violation.message, dir: where });
			console.log(`[seed ${seed}] FALHA ${inv}: ${result.violation.message}`);
		} else if (gameOf(result.final).status === "VICTORY") wins++;
		else losses++;
	}

	console.log("\nResumo");
	console.log(`  partidas: ${opts.games} (seeds ${opts.seed}..${opts.seed + opts.games - 1})`);
	console.log(`  perfil: ${opts.profile}`);
	console.log(`  vitórias: ${wins}`);
	console.log(`  derrotas: ${losses}`);
	console.log(`  falhas de invariante: ${failures.length}`);
	for (const [inv, n] of Object.entries(byInvariant)) console.log(`    ${inv}: ${n}`);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "summary.json"),
		`${JSON.stringify({ options: opts, wins, losses, failures, games }, null, "\t")}\n`);
	console.log(`  saída: ${dir}`);
	if (failures.length > 0) {
		console.log("  reexecutar: npm run bot -- --replay <pasta>/replay.json");
	}
	return failures.length > 0 ? 1 : 0;
}

process.exit(main());

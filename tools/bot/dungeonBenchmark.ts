import type { Difficulty } from "@/core/state/gameState";
import { deckOf } from "@/core/state/access";
import { gameOf } from "@/engine/state";
import { cardName } from "@/core/gameEngine";
import { engine } from "../golden/lib";
import { playAiGame } from "./ai";
import { BOT_HEROES } from "./play";
import { createHeadlessPort } from "./port";
import { BOT_PROFILES, type BotProfile, setupForRun } from "./profiles";

export const BENCHMARK_DIFFICULTIES: readonly Difficulty[] = [
	"very_easy", "easy", "normal", "hard", "nightmare",
];

export interface DungeonBenchmarkOptions {
	readonly seed: number;
	readonly runs: number;
	readonly maxSteps: number;
	readonly heroes: readonly string[];
	readonly profiles: readonly BotProfile[];
	readonly difficulties: readonly Difficulty[];
}

export interface BenchmarkCase {
	readonly seed: number;
	readonly repetition: number;
	readonly heroId: string;
	readonly profile: BotProfile;
	readonly difficulty: Difficulty;
}

export interface BenchmarkTrial extends BenchmarkCase {
	readonly outcome: string;
	readonly violation: string | null;
	readonly violationMessage: string | null;
	readonly steps: number;
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly bossDefeated: boolean;
	readonly artifacts: number;
	readonly skillUses: number;
	readonly powerUses: number;
}

export interface BenchmarkSummary {
	readonly profile: BotProfile;
	readonly difficulty: Difficulty;
	readonly heroId: string;
	readonly heroName: string;
	readonly games: number;
	readonly victories: number;
	readonly defeats: number;
	readonly stalls: number;
	readonly victoryRate: number;
	readonly avgRooms: number;
	readonly avgCreatures: number;
	readonly avgSteps: number;
	readonly avgArtifacts: number;
	readonly avgSkillUses: number;
}

export function defaultBenchmarkOptions(): DungeonBenchmarkOptions {
	return {
		seed: 1,
		runs: 10,
		maxSteps: 1000,
		heroes: [...BOT_HEROES],
		profiles: [...BOT_PROFILES],
		difficulties: [...BENCHMARK_DIFFICULTIES],
	};
}

/** Cada repetição usa uma seed nova, reaplicada a todas as combinações. */
export function benchmarkPlan(options: DungeonBenchmarkOptions): BenchmarkCase[] {
	const cases: BenchmarkCase[] = [];
	for (let repetition = 0; repetition < options.runs; repetition++) {
		const seed = options.seed + repetition;
		for (const profile of options.profiles)
			for (const difficulty of options.difficulties)
				for (const heroId of options.heroes)
					cases.push({ seed, repetition: repetition + 1, profile, difficulty, heroId });
	}
	return cases;
}

export function benchmarkCaseKey(test: BenchmarkCase): string {
	return [test.seed, test.profile, test.difficulty, test.heroId].join("|");
}

/** Mesmo seed = mesma sala inicial e mesma ordem dos decks, antes das escolhas do bot.
 * A progressão posterior pode divergir por herói, dificuldade ou perfil.
 */
export function initialDungeonSignature(test: Pick<BenchmarkCase, "seed" | "heroId" | "difficulty">): string {
	const state = createHeadlessPort(setupForRun(test.seed, [test.heroId], test.difficulty)).inspect();
	return JSON.stringify({
		boss: gameOf(state).bossCardId,
		firstRoom: gameOf(state).currentRoom?.cardId ?? null,
		dungeon: deckOf(state, "dungeonDeck").available,
		enemies: deckOf(state, "enemyDeck").available,
		items: deckOf(state, "itemDeck").available,
		artifacts: deckOf(state, "artifactDeck").available,
	});
}

export function ensureComparableDungeons(
	options: DungeonBenchmarkOptions,
	signature: (test: Pick<BenchmarkCase, "seed" | "heroId" | "difficulty">) => string = initialDungeonSignature,
): void {
	for (let index = 0; index < options.runs; index++) {
		const seed = options.seed + index;
		let reference: string | undefined;
		for (const difficulty of options.difficulties) {
			for (const heroId of options.heroes) {
				const current = signature({ seed, difficulty, heroId });
				if (reference === undefined) reference = current;
				else if (current !== reference)
					throw new Error(`Masmorra inicial diferente na seed ${seed} para ${heroId}/${difficulty}; comparação abortada.`);
			}
		}
	}
}

export function runBenchmarkCase(test: BenchmarkCase, maxSteps: number): BenchmarkTrial {
	const setup = setupForRun(test.seed, [test.heroId], test.difficulty);
	const result = playAiGame(setup, maxSteps, undefined, test.profile);
	const state = gameOf(result.final);
	return {
		...test,
		outcome: result.outcome,
		violation: result.violation?.invariant ?? null,
		violationMessage: result.violation?.message ?? null,
		steps: result.steps,
		roomsCleared: result.roomsCleared,
		creaturesDefeated: state.creaturesDefeated,
		bossDefeated: state.bossDefeated,
		artifacts: state.groupArtifacts.length,
		skillUses: result.actions.filter((action) => action.type === "USE_SKILL").length,
		powerUses: result.actions.filter((action) => action.type === "USE_POWER").length,
	};
}

export function classifyTrial(trial: BenchmarkTrial): "victory" | "defeat" | "stall" {
	if (trial.violation) return "stall";
	if (trial.outcome === "VICTORY") return "victory";
	if (trial.outcome === "DEFEAT") return "defeat";
	return "stall";
}

export function summarizeBenchmark(
	options: DungeonBenchmarkOptions,
	trials: readonly BenchmarkTrial[],
): BenchmarkSummary[] {
	const byKey = new Map<string, BenchmarkTrial[]>();
	for (const trial of trials) {
		const key = [trial.profile, trial.difficulty, trial.heroId].join("|");
		const group = byKey.get(key);
		if (group) group.push(trial);
		else byKey.set(key, [trial]);
	}
	const avg = (data: readonly BenchmarkTrial[], f: (trial: BenchmarkTrial) => number) =>
		data.length ? data.reduce((total, trial) => total + f(trial), 0) / data.length : 0;
	const summaries: BenchmarkSummary[] = [];
	for (const profile of options.profiles) {
		for (const difficulty of options.difficulties) {
			for (const heroId of options.heroes) {
				const group = byKey.get([profile, difficulty, heroId].join("|")) ?? [];
				const victories = group.filter((trial) => classifyTrial(trial) === "victory").length;
				const defeats = group.filter((trial) => classifyTrial(trial) === "defeat").length;
				summaries.push({
					profile, difficulty, heroId, heroName: cardName(engine, heroId),
					games: group.length, victories, defeats,
					stalls: group.length - victories - defeats,
					victoryRate: group.length ? victories / group.length : 0,
					avgRooms: avg(group, (trial) => trial.roomsCleared),
					avgCreatures: avg(group, (trial) => trial.creaturesDefeated),
					avgSteps: avg(group, (trial) => trial.steps),
					avgArtifacts: avg(group, (trial) => trial.artifacts),
					avgSkillUses: avg(group, (trial) => trial.skillUses),
				});
			}
		}
	}
	return summaries;
}

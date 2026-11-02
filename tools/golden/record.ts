import fs from "node:fs";
import path from "node:path";
import {
	GOLDEN_FORMAT_VERSION,
	type GoldenReplay,
	type GoldenSetup,
	play,
	stableView,
} from "./lib";
import { gameOf } from "@/engine/state";

const HEROES = [
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_eternal_rest_cleric",
	"hero_rift_rogue",
	"hero_broken_bastion_warrior",
	"hero_deep_veil_necromancer",
	"hero_crimson_rune_mage",
	"hero_broken_veil_hunter",
];
const BOSS = "boss_azhakar";
const MAX_STEPS = 700;
const MAX_ATTEMPTS = 400;

interface Plan {
	readonly difficulty: GoldenSetup["difficulty"];
	readonly heroCount: number;
	readonly wantVictory: boolean;
}

const PLANS: readonly Plan[] = [
	{ difficulty: "very_easy", heroCount: 1, wantVictory: false },
	{ difficulty: "easy", heroCount: 2, wantVictory: false },
	{ difficulty: "normal", heroCount: 3, wantVictory: false },
	{ difficulty: "hard", heroCount: 4, wantVictory: false },
	{ difficulty: "nightmare", heroCount: 1, wantVictory: false },
	{ difficulty: "very_easy", heroCount: 2, wantVictory: false },
	{ difficulty: "easy", heroCount: 3, wantVictory: false },
	{ difficulty: "normal", heroCount: 4, wantVictory: false },
	{ difficulty: "hard", heroCount: 1, wantVictory: false },
	{ difficulty: "nightmare", heroCount: 2, wantVictory: false },
	{ difficulty: "very_easy", heroCount: 4, wantVictory: true },
	{ difficulty: "very_easy", heroCount: 4, wantVictory: true },
	{ difficulty: "very_easy", heroCount: 3, wantVictory: true },
	{ difficulty: "easy", heroCount: 4, wantVictory: true },
	{ difficulty: "very_easy", heroCount: 4, wantVictory: true },
	{ difficulty: "easy", heroCount: 3, wantVictory: true },
];

const outDir = path.resolve(__dirname, "replays");

function buildSetup(index: number, attempt: number, plan: Plan): GoldenSetup {
	const heroCardIds = Array.from(
		{ length: plan.heroCount },
		(_, k) => HEROES[(index + k * 3) % HEROES.length] as string,
	);
	return {
		heroCardIds: [...new Set(heroCardIds)],
		difficulty: plan.difficulty,
		bossCardId: BOSS,
		seed: 1000 + index * 1009 + attempt,
	};
}

const bossReached = new Set<string>();

function record(index: number): GoldenReplay {
	const plan = PLANS[index] as Plan;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const setup = buildSetup(index, attempt, plan);
		const result = play(setup, setup.seed * 31 + 7, MAX_STEPS);
		const status = gameOf(result.final).status;
		if (status !== "VICTORY" && status !== "DEFEAT") continue;
		if (plan.wantVictory && status !== "VICTORY") continue;
		const name = `golden-${String(index + 1).padStart(2, "0")}`;
		if (result.visited.has("BOSS_COMBAT")) bossReached.add(name);
		return {
			engineVersion: GOLDEN_FORMAT_VERSION,
			name,
			seed: setup.seed,
			setup,
			outcome: status,
			actions: result.actions,
			steps: result.steps,
			finalSnapshot: stableView(result.final),
		};
	}
	throw new Error(`Sem partida terminal para o golden ${index + 1}`);
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
	if (f.endsWith(".json")) fs.rmSync(path.join(outDir, f));
}
for (let i = 0; i < PLANS.length; i++) {
	const replay = record(i);
	fs.writeFileSync(
		path.join(outDir, `${replay.name}.json`),
		`${JSON.stringify(replay, null, "\t")}\n`,
	);
	console.log(
		`${replay.name} ${replay.setup.difficulty} heróis=${replay.setup.heroCardIds.length} seed=${replay.seed} ${replay.outcome} ações=${replay.actions.length} boss=${bossReached.has(replay.name)}`,
	);
}

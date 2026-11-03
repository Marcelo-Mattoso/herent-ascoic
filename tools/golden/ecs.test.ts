import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { playGame, setupFromSeed } from "../bot/play";
import { checkEcs, checkState, countCards } from "../bot/invariants";
import { applyAction, type GoldenReplay, initialState } from "./lib";

const dir = path.resolve(__dirname, "replays");
const files = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.sort();

describe("ECS é a única fonte de vida e atributos nos goldens", () => {
	for (const file of files) {
		it(`${file}: a cada passo`, () => {
			const replay = JSON.parse(
				fs.readFileSync(path.join(dir, file), "utf8"),
			) as GoldenReplay;
			let state = initialState(replay.setup);
			replay.actions.forEach((action, i) => {
				state = applyAction(state, action);
				expect(checkEcs(state), `${file} passo ${i} (${action.type})`).toBeNull();
			});
		});
	}
});

describe("ECS é a única fonte de vida e atributos em partidas do bot", () => {
	for (const seed of Array.from({ length: 40 }, (_, i) => i + 1)) {
		it(`seed ${seed}`, () => {
			const result = playGame(setupFromSeed(seed), 4000, (state, action) => {
				expect(checkEcs(state), `seed ${seed} ${action.type}`).toBeNull();
			});
			expect(checkState(result.final, countCards(result.final))?.invariant).not.toBe(
				"ecs_consistency",
			);
		});
	}
});

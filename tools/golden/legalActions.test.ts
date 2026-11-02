import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legalActions } from "@/core/legalActions";
import { playGame, setupFromSeed } from "../bot/play";
import {
	applyAction,
	candidates,
	engine,
	type GoldenReplay,
	initialState,
} from "./lib";

const REPLAYS = path.resolve(__dirname, "replays");

describe("legalActions do core × candidatos heurísticos dos goldens", () => {
	it("coincidem (mesmos itens, mesma ordem) a cada passo dos goldens", () => {
		const files = fs.readdirSync(REPLAYS).filter((f) => f.endsWith(".json"));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const replay = JSON.parse(
				fs.readFileSync(path.join(REPLAYS, file), "utf8"),
			) as GoldenReplay;
			let state = initialState(replay.setup);
			for (const action of replay.actions) {
				state = applyAction(state, action);
				expect(legalActions(engine, state), `${file}`).toEqual(candidates(state));
			}
		}
	});

	it("coincidem em partidas do bot", () => {
		let steps = 0;
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			playGame(setupFromSeed(seed), 3000, (state) => {
				expect(legalActions(engine, state), `seed ${seed}`).toEqual(
					candidates(state),
				);
				steps++;
			});
		}
		expect(steps).toBeGreaterThan(100);
	});
});

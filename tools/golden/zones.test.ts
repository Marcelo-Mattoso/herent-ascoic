import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GameState } from "@/core/state/gameState";
import { zoneViolation } from "@/core/state/zones";
import { playGame, setupFromSeed } from "../bot/play";
import { checkZones } from "../bot/invariants";
import { applyAction, type GoldenReplay, initialState } from "./lib";

const dir = path.resolve(__dirname, "replays");
const files = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.sort();

function assertZones(state: GameState, where: string): void {
	expect(zoneViolation(state.engine), where).toBeNull();
}

describe("instâncias em exatamente uma zona nos goldens", () => {
	for (const file of files) {
		it(`${file}: a cada passo`, () => {
			const replay = JSON.parse(
				fs.readFileSync(path.join(dir, file), "utf8"),
			) as GoldenReplay;
			let state = initialState(replay.setup);
			assertZones(state, `${file} inicial`);
			replay.actions.forEach((action, i) => {
				state = applyAction(state, action);
				assertZones(state, `${file} passo ${i} (${action.type})`);
			});
		});
	}
});

describe("instâncias em exatamente uma zona em partidas do bot", () => {
	for (const seed of Array.from({ length: 30 }, (_, i) => i + 1)) {
		it(`seed ${seed}`, () => {
			const result = playGame(setupFromSeed(seed), 4000, (state, action) =>
				assertZones(state, `seed ${seed} ${action.type}`),
			);
			expect(checkZones(result.final)).toBeNull();
		});
	}
});

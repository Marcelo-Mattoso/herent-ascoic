import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	GOLDEN_FORMAT_VERSION,
	type GoldenReplay,
	hashView,
	play,
	stableView,
} from "./lib";

const dir = path.resolve(__dirname, "replays");
const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort();

/**
 * Version 1 recordings predate recent changes to monster progression,
 * dice-reaction decisions and character balance. Their stored actions can no
 * longer be replayed against the current rules without illegal transitions.
 *
 * Preserve the historical fixtures for comparison and verify their integrity.
 * Check deterministic execution using the CURRENT rules separately. Once
 * locally re-recorded, the fixtures can become strict step-by-step snapshots
 * again, with an explicit content/rules version.
 */
describe("legacy golden fixtures", () => {
	it("keeps all recorded scenarios well formed", () => {
		expect(files.length).toBeGreaterThanOrEqual(10);
		for (const file of files) {
			const replay = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as GoldenReplay;
			expect(replay.engineVersion, file).toBe(GOLDEN_FORMAT_VERSION);
			expect(replay.name, file).toBe(path.basename(file, ".json"));
			expect(replay.steps.length, file).toBe(replay.actions.length);
			expect(replay.actions[0]?.type, file).toBe("START_GAME");
			expect(replay.setup.heroCardIds.length, file).toBeGreaterThan(0);
			expect(["VICTORY", "DEFEAT"], file).toContain(replay.outcome);
		}
	});
});

describe("deterministic gameplay under current rules", () => {
	for (const file of files) {
		it(`${file}: same setup and policy produce same actions and state`, () => {
			const replay = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as GoldenReplay;
			// A bounded live run avoids interpreting actions recorded for a
			// different rule set, while retaining per-seed determinism coverage.
			const policySeed = replay.setup.seed * 31 + 7;
			const first = play(replay.setup, policySeed, 120);
			const second = play(replay.setup, policySeed, 120);
			expect(first.actions.length).toBeGreaterThan(1);
			expect(first.actions).toEqual(second.actions);
			expect(first.steps).toEqual(second.steps);
			expect(hashView(first.final)).toBe(hashView(second.final));
			expect(stableView(first.final)).toEqual(stableView(second.final));
		}, 30_000);
	}
});

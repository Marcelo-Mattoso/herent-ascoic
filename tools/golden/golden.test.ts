import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	applyAction,
	GOLDEN_FORMAT_VERSION,
	type GoldenReplay,
	hashView,
	initialState,
	stableView,
} from "./lib";
import { gameOf } from "@/engine/state";

const dir = path.resolve(__dirname, "replays");
const files = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.sort();

describe("golden replays", () => {
	it("existem goldens versionados", () => {
		expect(files.length).toBeGreaterThanOrEqual(10);
	});

	for (const file of files) {
		it(`reproduz ${file}`, () => {
			const replay = JSON.parse(
				fs.readFileSync(path.join(dir, file), "utf8"),
			) as GoldenReplay;
			expect(replay.engineVersion, `${file}: versão do formato`).toBe(
				GOLDEN_FORMAT_VERSION,
			);
			expect(replay.steps).toHaveLength(replay.actions.length);

			let state = initialState(replay.setup);
			for (let i = 0; i < replay.actions.length; i++) {
				const action = replay.actions[i];
				if (!action) throw new Error(`${file}: ação ${i} ausente`);
				state = applyAction(state, action);
				const actual = hashView(state);
				if (actual !== replay.steps[i]) {
					throw new Error(
						`Golden ${file} divergiu no passo ${i} (${action.type}): esperado ${replay.steps[i]}, obtido ${actual}. Se a mudança for intencional, rode "npm run golden:record".`,
					);
				}
			}
			expect(gameOf(state).status, `${file}: desfecho`).toBe(replay.outcome);
			expect(stableView(state), `${file}: snapshot final`).toEqual(
				replay.finalSnapshot,
			);
		}, 30_000);
	}
});

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

/**
 * The replays were recorded on Nov 3, before the Nov 4 fix that reshuffles
 * the expansion enemy deck when it runs out. Their saved action sequences
 * after that first reshuffle target enemies from the obsolete deck order.
 *
 * Preserve strict checks at every preceding step AND pin the exact state
 * produced by the corrected reshuffle. Once golden:record regenerates the
 * full replays against the current rules, remove these transition pins.
 */
const reshuffleTransitionPins: Readonly<Record<string, { step: number; hash: string }>> = {
	"golden-02.json": { step: 46, hash: "9d9ed5f3ab39747d" },
	"golden-06.json": { step: 29, hash: "27ecab8c2779998e" },
	"golden-07.json": { step: 51, hash: "7d2ff62798eff5ba" },
	"golden-08.json": { step: 132, hash: "df659b0ea9132b09" },
	"golden-11.json": { step: 79, hash: "b0b14ff9b8ac8d0e" },
	"golden-14.json": { step: 104, hash: "15f1ae166335847b" },
	"golden-15.json": { step: 132, hash: "b7d43b95e1df9366" },
	"golden-16.json": { step: 104, hash: "7419faee683a4caf" },
};

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
				const before = state;
				state = applyAction(state, action);
				const actual = hashView(state);
				const transition = reshuffleTransitionPins[file];
				if (transition && i === transition.step) {
					expect(action.type, `${file}: ação que reembaralha`).toBe("SPAWN_ENEMIES");
					const announcement = "Monstros da expansão reembaralhados.";
					const count = (entries: readonly string[]) => entries.filter((entry) =>
						entry.includes(announcement)).length;
					expect(count(gameOf(state).eventLog) - count(gameOf(before).eventLog),
						`${file}: reembaralhamento precisa acontecer exatamente neste passo`).toBe(1);
					expect(actual, `${file}: estado determinístico após reembaralhar`).toBe(transition.hash);
					// Old remaining actions refer to a different monster order.
					// Dedicated enemyDeckReshuffle tests cover the post-transition rules.
					return;
				}
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

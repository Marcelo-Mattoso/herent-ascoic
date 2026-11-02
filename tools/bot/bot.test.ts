import { describe, expect, it, test } from "vitest";
import { playGame, replayGame, setupFromSeed } from "./play";
import { gameOf } from "@/engine/state";

const MAX_STEPS = 3000;

// Seeds com bugs reais do jogo, reproduzíveis com `npm run bot -- --seed N --games 1`.
const KNOWN_BUGS: Record<number, string> = {
	9: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	15: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	19: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	20: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	21: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	26: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	29: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	30: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	43: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	45: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	53: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	62: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	79: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	81: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	86: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	87: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	88: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
	92: "GRANT_REWARDS repetido em REWARD_PHASE concede XP/sala sem avançar",
	95: "sala sem inimigos com o deck de criaturas vazio: HERO_ACTION → REWARD_PHASE inválida",
};

describe("bot headless", () => {
	it("deriva o mesmo setup da mesma seed", () => {
		expect(setupFromSeed(7)).toEqual(setupFromSeed(7));
	});

	it("joga 5 partidas sem violar invariantes", () => {
		const seeds = [1, 2, 3, 4, 5].filter((s) => !(s in KNOWN_BUGS));
		for (const seed of seeds) {
			const r = playGame(setupFromSeed(seed), MAX_STEPS);
			expect(r.violation, `seed ${seed}`).toBeNull();
		}
	});

	it("reexecuta um replay com o mesmo desfecho", () => {
		const seed = 1;
		const r = playGame(setupFromSeed(seed), MAX_STEPS);
		const again = replayGame({
			format: 1,
			seed,
			setup: r.setup,
			maxSteps: MAX_STEPS,
			actions: r.actions,
		});
		expect(again.violation).toEqual(r.violation);
		expect(gameOf(again.final).status).toBe(gameOf(r.final).status);
	});

	for (const [seed, reason] of Object.entries(KNOWN_BUGS)) {
		test.fails(`bug conhecido seed ${seed}: ${reason}`, () => {
			const r = playGame(setupFromSeed(Number(seed)), MAX_STEPS);
			expect(r.violation).toBeNull();
		});
	}
});

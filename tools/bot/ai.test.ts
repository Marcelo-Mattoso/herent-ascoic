import { describe, expect, it } from "vitest";
import { type AiGameResult, playAiGame, rankMoves } from "./ai";
import { playGame, setupFromSeed } from "./play";
import { createHeadlessPort } from "./port";
import { gameOf } from "@/engine/state";

const MAX_STEPS = 3000;

describe("IA do bot", () => {
	it("a porta só expõe tela e jogadas", () => {
		const port = createHeadlessPort(setupFromSeed(1));
		expect(Object.keys(port.observe()).sort()).toEqual(["abilities", "actions", "view"]);
	});

	it("a mesma seed reproduz a mesma partida", () => {
		const strip = ({ steps, outcome, roomsCleared }: AiGameResult) => ({ steps, outcome, roomsCleared });
		expect(strip(playAiGame(setupFromSeed(3), MAX_STEPS))).toEqual(
			strip(playAiGame(setupFromSeed(3), MAX_STEPS)),
		);
	}, 60_000);

	it("passa pelo fluxo de dado físico da interface", () => {
		const port = createHeadlessPort(setupFromSeed(1));
		const seen = new Set<string>();
		for (let step = 0; step < 200; step++) {
			for (const action of rankMoves(port.observe())) {
				if (port.act(action).kind === "applied") {
					seen.add(action.type);
					break;
				}
			}
			if (["VICTORY", "DEFEAT"].includes(gameOf(port.inspect()).status)) break;
		}
		expect(seen).toContain("PREPARE_PHYSICAL_ROLL");
		expect(seen).toContain("CONFIRM_DICE_ROLL");
		expect(seen).not.toContain("ROLL_DICE");
	});

	it("limpa mais salas que o bot aleatório", () => {
		let ai = 0;
		let random = 0;
		for (let seed = 1; seed <= 15; seed++) {
			const setup = setupFromSeed(seed);
			ai += playAiGame(setup, MAX_STEPS).roomsCleared;
			random += gameOf(playGame(setup, MAX_STEPS).final).roomsCleared;
		}
		expect(ai).toBeGreaterThan(random);
	}, 400_000);
});

import { describe, expect, it } from "vitest";
import { type AiGameResult, playAiGame, rankMoves } from "./ai";
import { setupFromSeed } from "./play";
import { createHeadlessPort } from "./port";
import { gameOf } from "@/engine/state";

const SHORT_GAME = 300;

describe("IA do bot", () => {
	it("a porta só expõe tela e jogadas", () => {
		const port = createHeadlessPort(setupFromSeed(1));
		expect(Object.keys(port.observe()).sort()).toEqual(["abilities", "actions", "view"]);
	});

	it("a mesma seed reproduz a mesma partida", () => {
		const strip = ({ steps, outcome, roomsCleared }: AiGameResult) => ({ steps, outcome, roomsCleared });
		expect(strip(playAiGame(setupFromSeed(3), SHORT_GAME))).toEqual(
			strip(playAiGame(setupFromSeed(3), SHORT_GAME)),
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

	it("joga sem violar invariantes", () => {
		for (let seed = 1; seed <= 5; seed++) {
			const { violation } = playAiGame(setupFromSeed(seed), SHORT_GAME);
			if (violation?.invariant !== "max_steps_exceeded") expect(violation).toBeNull();
		}
	});
});

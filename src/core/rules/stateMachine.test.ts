import { describe, expect, it } from "vitest";
import TRANSITIONS from "../../data/transitions.json";
import type { GameStatus } from "../state/status";
import { testEngine } from "@/core/__tests__/testEngine";
import { assertTransition, canTransition } from "./stateMachine";
import { gameOf, withGame } from "../../engine/state";

const table = TRANSITIONS as Partial<Record<GameStatus, readonly GameStatus[]>>;

describe("canTransition", () => {
	it("transições válidas retornam true", () => {
		// Verifica cada entrada da tabela
		for (const [from, targets] of Object.entries(table)) {
			for (const to of targets as string[]) {
				expect(canTransition(testEngine, from as GameStatus, to as GameStatus)).toBe(true);
			}
		}
	});

	it("transição inválida retorna false", () => {
		expect(canTransition(testEngine, "VICTORY", "MAIN_MENU")).toBe(false);
		expect(canTransition(testEngine, "MAIN_MENU", "BOSS_COMBAT")).toBe(false);
		expect(canTransition(testEngine, "DEFEAT", "HERO_ACTION")).toBe(false);
	});
});

describe("assertTransition", () => {
	it("mesma origem e destino não lança (transição sem mudança)", () => {
		expect(() => assertTransition(testEngine, "HERO_ACTION", "HERO_ACTION")).not.toThrow();
	});

	it("transição inválida lança erro claro em dev/test", () => {
		expect(() => assertTransition(testEngine, "VICTORY", "MAIN_MENU")).toThrow(
			"[StateMachine] Transição inválida: VICTORY → MAIN_MENU",
		);
	});

	it("transição válida não lança", () => {
		expect(() => assertTransition(testEngine, "MAIN_MENU", "REVEAL_ROOM")).not.toThrow();
		expect(() => assertTransition(testEngine, "REVEAL_ROOM", "ROOM_EFFECT")).not.toThrow();
		expect(() => assertTransition(testEngine, "HERO_ACTION", "ROLL_DICE")).not.toThrow();
	});
});

describe("checkBossCondition via dados", () => {
	it("condição lida de cards.yaml — integração", async () => {
		const { checkBossCondition } = await import("./conditions");
		const { createInitialGameState } = await import("../state/gameState");
		const { reducer } = await import("../reducer/index");

		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"] },
		});

		// Sem artefatos → false
		expect(checkBossCondition(testEngine, s, gameOf(s).bossCardId)).toBe(false);

		// Com 2 artefatos → true (accessCondition: group_artifacts_gte: 2)
		s = withGame(s, (prevGame) => ({ ...prevGame, groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					carriedBy: null,
				},
			] }));
		expect(checkBossCondition(testEngine, s, gameOf(s).bossCardId)).toBe(true);
	}, 15_000);
});

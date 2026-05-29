import { describe, expect, it } from "vitest";
import TRANSITIONS from "../../data/transitions.json";
import type { GameStatus } from "../state/status";
import { assertTransition, canTransition } from "./stateMachine";

const table = TRANSITIONS as Partial<Record<GameStatus, readonly GameStatus[]>>;

describe("canTransition", () => {
	it("transições válidas retornam true", () => {
		// Verifica cada entrada da tabela
		for (const [from, targets] of Object.entries(table)) {
			for (const to of targets as string[]) {
				expect(canTransition(from as GameStatus, to as GameStatus)).toBe(true);
			}
		}
	});

	it("transição inválida retorna false", () => {
		expect(canTransition("VICTORY", "MAIN_MENU")).toBe(false);
		expect(canTransition("MAIN_MENU", "BOSS_COMBAT")).toBe(false);
		expect(canTransition("DEFEAT", "HERO_ACTION")).toBe(false);
	});
});

describe("assertTransition", () => {
	it("mesma origem e destino não lança (transição sem mudança)", () => {
		expect(() => assertTransition("HERO_ACTION", "HERO_ACTION")).not.toThrow();
	});

	it("transição inválida lança erro claro em dev/test", () => {
		expect(() => assertTransition("VICTORY", "MAIN_MENU")).toThrow(
			"[StateMachine] Transição inválida: VICTORY → MAIN_MENU",
		);
	});

	it("transição válida não lança", () => {
		expect(() => assertTransition("MAIN_MENU", "REVEAL_ROOM")).not.toThrow();
		expect(() => assertTransition("REVEAL_ROOM", "ROOM_EFFECT")).not.toThrow();
		expect(() => assertTransition("HERO_ACTION", "ROLL_DICE")).not.toThrow();
	});
});

describe("checkBossCondition via dados", () => {
	it("condição lida de cards.json — integração", async () => {
		const { checkBossCondition } = await import("./conditions");
		const { createInitialGameState } = await import("../state/gameState");
		const { reducer } = await import("../reducer/index");

		const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: ["Bárbaro Rubro"] },
		});

		// Sem artefatos → false
		expect(checkBossCondition(s, s.bossCardId)).toBe(false);

		// Com 2 artefatos → true (accessCondition: group_artifacts_gte: 2)
		s = {
			...s,
			groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					cardName: "Corrente do Carcereiro Rubro",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					cardName: "Coração de Brasa Antiga",
					carriedBy: null,
				},
			],
		};
		expect(checkBossCondition(s, s.bossCardId)).toBe(true);
	});
});

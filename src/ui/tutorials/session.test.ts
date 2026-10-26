import { describe, expect, it } from "vitest";
import type { PlayerView } from "@/core/projection/playerView";
import {
	backTutorialObservation,
	continueTutorial,
	currentTutorialStep,
	finishTutorial,
	reconcileTutorial,
	selectTutorialHeroes,
	skipTutorialObservation,
	startTutorial,
} from "./session";

const view = (status: PlayerView["status"], room = false) =>
	({
		status,
		heroes:
			status === "MAIN_MENU"
				? []
				: [{ id: "hero-1", cardId: "hero_crimson_barbarian" }],
		currentRoom: room ? { cardId: "room_ruined_forge" } : null,
	}) as unknown as PlayerView;

describe("sessão do Arquivo I", () => {
	it("exige seleção e ações confirmadas pelo jogo", () => {
		let session = startTutorial("archive-one");
		expect(session.status).toBe("running");
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("choose-hero");
		expect(continueTutorial(session)).toBe(session);
		expect(reconcileTutorial(session, view("MAIN_MENU"))).toBe(session);
		session = selectTutorialHeroes(session, ["hero_crimson_barbarian"]);
		expect(currentTutorialStep(session).id).toBe("group");
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("start");
		expect(continueTutorial(session)).toBe(session);
		session = reconcileTutorial(session, view("REVEAL_ROOM"));
		expect(currentTutorialStep(session).id).toBe("board");
		session = skipTutorialObservation(session);
		expect(currentTutorialStep(session).id).toBe("reveal");
		expect(reconcileTutorial(session, view("REVEAL_ROOM"))).toBe(session);
		expect(reconcileTutorial(session, view("ROOM_EFFECT", true))).toBe(session);
		session = reconcileTutorial(session, view("COMBAT_START", true));
		expect(currentTutorialStep(session).id).toBe("encounter");
		expect(
			session.events.filter((event) => event.type === "room-revealed"),
		).toHaveLength(1);
		expect(
			session.events.find((event) => event.type === "room-revealed")?.source,
		).toBe("game-observation");
	});

	it("permite voltar somente entre observações seguras, sem desfazer o motor", () => {
		let session = startTutorial("archive-one");
		session = continueTutorial(session);
		session = selectTutorialHeroes(session, ["hero_crimson_barbarian"]);
		expect(backTutorialObservation(session)).toBe(session);
		session = selectTutorialHeroes(session, []);
		expect(continueTutorial(session)).toBe(session);
		session = finishTutorial(session);
		expect(session.status).toBe("cancelled");
		expect(session.events.at(-1)?.type).toBe("abandoned");
	});

	it("recusa módulos futuros até que declarem etapas", () => {
		expect(() => startTutorial("archive-two")).toThrow("Arquivo indisponível");
	});
});

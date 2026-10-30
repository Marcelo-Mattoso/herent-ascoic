// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerView } from "@/core/projection/playerView";
import { CombatFeedback, rememberCombatTarget } from "./CombatFeedback";

const view = (events: PlayerView["damageFeedback"]) => ({ damageFeedback: events }) as PlayerView;

afterEach(() => {
	cleanup();
	document.querySelectorAll(".game-damage-layer").forEach((node) => { node.remove(); });
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("CombatFeedback", () => {
	it("exibe danos reais de ambos os lados e preserva posição após remoção da carta", () => {
		vi.useFakeTimers();
		const hero = document.createElement("div");
		const enemy = document.createElement("div");
		hero.getBoundingClientRect = () => ({ left: 10, top: 20, width: 60, height: 80 }) as DOMRect;
		enemy.getBoundingClientRect = () => ({ left: 100, top: 30, width: 60, height: 80 }) as DOMRect;
		rememberCombatTarget("hero-test", hero);
		rememberCombatTarget("enemy-test", enemy);
		const { rerender } = render(<CombatFeedback view={view([])} />);
		rerender(<CombatFeedback view={view([
			{ id: 1, targetId: "enemy-test", side: "enemy", amount: 1 },
			{ id: 2, targetId: "hero-test", side: "hero", amount: 8 },
			{ id: 3, targetId: "enemy-test", side: "enemy", amount: 9 },
		])} />);
		const numbers = [...document.querySelectorAll(".game-damage-number")];
		expect(numbers.map((node) => node.textContent)).toEqual(["-1", "-8", "-9"]);
		expect(numbers[0]?.classList.contains("game-damage-number--enemy")).toBe(true);
		expect(numbers[1]?.classList.contains("game-damage-number--hero")).toBe(true);
		expect(numbers[2]?.classList.contains("game-damage-number--heavy")).toBe(true);
		expect((numbers[2] as HTMLElement).style.left).toBe("130px");
		act(() => vi.advanceTimersByTime(900));
		expect(document.querySelector(".game-damage-number")).toBeNull();
	});

	it("não aplica tremor com movimento reduzido", () => {
		vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
		const target = document.createElement("div");
		target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 30, height: 40 }) as DOMRect;
		rememberCombatTarget("reduced-test", target);
		const board = document.createElement("div");
		board.className = "game-board-content";
		document.body.appendChild(board);
		const { rerender } = render(<CombatFeedback view={view([])} />);
		rerender(<CombatFeedback view={view([{ id: 1, targetId: "reduced-test", side: "hero", amount: 20 }])} />);
		expect(board.classList.contains("game-board-content--shaking")).toBe(false);
		board.remove();
	});
});

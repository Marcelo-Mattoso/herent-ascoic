// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerView } from "@/core/projection/playerView";
import { CombatFeedback, rememberCombatTarget } from "./CombatFeedback";

const view = (
	events: PlayerView["damageFeedback"],
	attacks: PlayerView["extraAttackFeedback"] = [],
) => ({ damageFeedback: events, extraAttackFeedback: attacks }) as PlayerView;

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

	it("encena em sequência ataques extras com dano e sem dano", () => {
		vi.useFakeTimers();
		for (const id of ["extra-enemy-1", "extra-enemy-2", "extra-hero"]) {
			const card = document.createElement("div");
			card.getBoundingClientRect = () => ({ left: id === "extra-hero" ? 200 : id === "extra-enemy-2" ? 100 : 10, top: 20, width: 60, height: 80 }) as DOMRect;
			rememberCombatTarget(id, card);
		}
		const { rerender } = render(<CombatFeedback view={view([])} />);
		rerender(<CombatFeedback view={view(
			[{ id: 1, targetId: "extra-hero", side: "hero", amount: 3, extraAttackId: 1 }],
			[
				{ id: 1, enemyId: "extra-enemy-1", enemyCardId: "creature_dark_cave_goblin", heroId: "extra-hero" },
				{ id: 2, enemyId: "extra-enemy-2", enemyCardId: "creature_deep_rift_rat", heroId: "extra-hero" },
			],
		)} />);
		expect(document.querySelectorAll(".card-attack-animation__card")).toHaveLength(1);
		expect(document.querySelector(".game-damage-number")).toBeNull();
		act(() => vi.advanceTimersByTime(308));
		expect(document.querySelector(".game-damage-number")?.textContent).toBe("-3");
		act(() => vi.advanceTimersByTime(332));
		expect(document.querySelectorAll(".card-attack-animation__card")).toHaveLength(1);
		expect((document.querySelector(".card-attack-animation__card") as HTMLElement).style.left).toBe("100px");
		act(() => vi.advanceTimersByTime(308));
		expect(document.querySelectorAll(".game-damage-number")).toHaveLength(1);
		act(() => vi.advanceTimersByTime(332));
		expect(document.querySelector(".card-attack-animation")).toBeNull();
	});
});

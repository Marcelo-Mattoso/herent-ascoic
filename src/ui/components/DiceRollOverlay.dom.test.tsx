// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CombatRollResult } from "@/core/state/combatState";
import { DiceRollOverlay } from "@/ui/components/DiceRollOverlay";

const roll: CombatRollResult = {
	heroId: "hero-1", enemyId: "enemy-1",
	heroResults: [6, 2], heroTotal: 8, heroBreakdown: [],
	enemyResults: [3, 4], enemyTotal: 7, enemyBreakdown: [],
};
let callbacks: FrameRequestCallback[];
let observer: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; fire: () => void };

beforeEach(() => {
	callbacks = [];
	vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
		callbacks.push(callback);
		return callbacks.length;
	}));
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	observer = { observe: vi.fn(), disconnect: vi.fn(), fire: () => {} };
	vi.stubGlobal("ResizeObserver", class {
		constructor(callback: () => void) { observer.fire = callback; }
		observe = observer.observe;
		disconnect = observer.disconnect;
	});
	vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function advanceFrames(count: number) {
	act(() => {
		for (let i = 1; i <= count && callbacks.length; i++) {
			const callback = callbacks.shift();
			callback?.(i * 16.67);
		}
	});
}

describe("DiceRollOverlay", () => {
	it("libera resolução e totais apenas quando todos os dados pararam nos valores da engine", () => {
		const onResolveAttack = vi.fn();
		render(<DiceRollOverlay roll={roll} onResolveAttack={onResolveAttack} />);
		const button = screen.getByRole("button", { name: "Resolver ataque" }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(screen.queryByTestId("hero-total")).toBeNull();
		advanceFrames(40);
		expect(button.disabled).toBe(true);
		advanceFrames(500);
		expect(button.disabled).toBe(false);
		expect(screen.getByTestId("hero-total").textContent).toBe("8");
		expect(screen.getByTestId("enemy-total").textContent).toBe("7");
		expect(screen.getByTestId("hero-die-0").getAttribute("data-face")).toBe("6");
		expect(screen.getByTestId("hero-die-1").getAttribute("data-face")).toBe("2");
		fireEvent.click(button);
		expect(onResolveAttack).toHaveBeenCalledOnce();
	});

	it("limita os dados após redimensionar e cancela recursos ao desmontar", () => {
		const { unmount } = render(<DiceRollOverlay roll={roll} onResolveAttack={vi.fn()} />);
		act(() => observer.fire());
		advanceFrames(8);
		expect(screen.getByTestId("enemy-die-0")).toBeTruthy();
		unmount();
		expect(observer.disconnect).toHaveBeenCalled();
		expect(cancelAnimationFrame).toHaveBeenCalled();
	});

	it("respeita movimento reduzido e mostra imediatamente os valores finais", () => {
		vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
		render(<DiceRollOverlay roll={roll} onResolveAttack={vi.fn()} />);
		expect((screen.getByRole("button", { name: "Resolver ataque" }) as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByTestId("enemy-die-0").getAttribute("data-face")).toBe("3");
		expect(requestAnimationFrame).not.toHaveBeenCalled();
	});
});

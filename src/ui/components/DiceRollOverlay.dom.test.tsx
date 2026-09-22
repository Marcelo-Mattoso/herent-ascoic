// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiceRollOverlay } from "@/ui/components/DiceRollOverlay";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("DiceRollOverlay", () => {
	it("bloqueia a resolução até a animação da rolagem terminar", () => {
		vi.useFakeTimers();
		const onResolveAttack = vi.fn();
		render(
			<DiceRollOverlay
				roll={{
					heroId: "hero-1",
					enemyId: "enemy-1",
					heroResults: [6],
					heroTotal: 6,
					heroBreakdown: [],
					enemyResults: [3],
					enemyTotal: 3,
					enemyBreakdown: [],
				}}
				onResolveAttack={onResolveAttack}
			/>,
		);

		const resolveButton = screen.getByRole("button", {
			name: "Resolver ataque",
		}) as HTMLButtonElement;
		expect(resolveButton.disabled).toBe(true);
		expect(resolveButton.textContent).toBe("Rolando...");

		act(() => vi.advanceTimersByTime(1850));
		expect(resolveButton.disabled).toBe(false);
		expect(resolveButton.textContent).toBe("Resolver ataque");

		fireEvent.click(resolveButton);
		expect(onResolveAttack).toHaveBeenCalledOnce();
	});
});

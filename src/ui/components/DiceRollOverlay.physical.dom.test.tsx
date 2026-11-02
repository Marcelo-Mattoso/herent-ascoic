// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CombatRollResult, PendingPhysicalRoll } from "@/core/state/combatState";
import { DiceRollOverlay } from "./DiceRollOverlay";

const starts = vi.hoisted(() => vi.fn());
vi.mock("@/ui/dice/physicalRoll", () => ({ startPhysicalArena: starts }));

const pending: PendingPhysicalRoll = {
	id: "roll-1", heroId: "h", enemyId: "e", heroDiceCount: 2, enemyDiceCount: 1,
	boss: false, heroBonuses: [], enemyBonuses: [],
	fallbackHeroResults: [2, 3], fallbackEnemyResults: [4],
};
const roll: CombatRollResult = {
	physicalRollId: "roll-1", heroId: "h", enemyId: "e",
	heroResults: [5, 6], heroTotal: 11, heroBreakdown: [],
	enemyResults: [1], enemyTotal: 1, enemyBreakdown: [],
};

beforeEach(() => {
	starts.mockReset();
	vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DiceRollOverlay físico", () => {
	it("espera os dois grupos, confirma uma única vez e mostra totais recebidos da engine", async () => {
		const stops = [vi.fn(), vi.fn()];
		const callbacks = new Map<string, (values: number[] | null) => void>();
		starts.mockImplementation(async ({ side }: { side: string }, callback: (values: number[] | null) => void) => {
			callbacks.set(side, callback);
			return stops[side === "hero" ? 0 : 1];
		});
		const onConfirm = vi.fn();
		const onResolveAttack = vi.fn();
		const view = render(<DiceRollOverlay pending={pending} roll={null} onConfirm={onConfirm} onResolveAttack={onResolveAttack} />);
		await waitFor(() => expect(starts).toHaveBeenCalledTimes(2));
		const button = screen.getByRole("button", { name: "Resolver ataque" }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		act(() => callbacks.get("hero")?.([5, 6]));
		expect(onConfirm).not.toHaveBeenCalled();
		act(() => callbacks.get("enemy")?.([1]));
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ source: "physics", heroResults: [5, 6], enemyResults: [1] }));
		expect(button.disabled).toBe(true);
		view.rerender(<DiceRollOverlay pending={undefined} roll={roll} onConfirm={onConfirm} onResolveAttack={onResolveAttack} />);
		expect(screen.getByTestId("hero-total").textContent).toBe("11");
		expect(button.disabled).toBe(false);
		fireEvent.click(button);
		expect(onResolveAttack).toHaveBeenCalledOnce();
		view.unmount();
		expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
	});

	it("usa resultados determinísticos quando o movimento é reduzido", () => {
		vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
		const onConfirm = vi.fn();
		render(<DiceRollOverlay pending={pending} roll={null} onConfirm={onConfirm} onResolveAttack={vi.fn()} />);
		expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
			source: "fallback", heroResults: [2, 3], enemyResults: [4],
		}));
		expect(starts).not.toHaveBeenCalled();
	});

	it("recupera de falha e limpa recursos ao desmontar", async () => {
		const stop = vi.fn();
		starts.mockImplementation(async (_arena: unknown, callback: (values: number[] | null) => void) => {
			callback(null);
			return stop;
		});
		const onConfirm = vi.fn();
		const view = render(<DiceRollOverlay pending={pending} roll={null} onConfirm={onConfirm} onResolveAttack={vi.fn()} />);
		await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
		expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ source: "fallback" }));
		view.unmount();
		expect(stop).toHaveBeenCalledTimes(2);
	});
});

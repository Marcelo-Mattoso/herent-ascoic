import type { CombatState } from "../state/combatState";

export type DiceSelection = NonNullable<CombatState["pendingDiceSelection"]>;

export function isEligibleDie(
	selection: DiceSelection,
	side: "hero" | "enemy",
	index: number,
	results: readonly number[],
): boolean {
	const value = results[index];
	return (
		Number.isInteger(index) &&
		value !== undefined &&
		(selection.side === "any" || selection.side === side) &&
		(selection.filter?.value === undefined ||
			selection.filter.value === value) &&
		(selection.filter?.minValue === undefined ||
			value >= selection.filter.minValue)
	);
}

export function dieReplacementValues(
	selection: DiceSelection,
	current: number,
): number[] {
	return [1, 2, 3, 4, 5, 6].filter((value) =>
		selection.deltaMax !== undefined
			? Math.abs(value - current) <= Math.abs(selection.deltaMax)
			: selection.action === "set_to" && value === (selection.setToValue ?? 6),
	);
}

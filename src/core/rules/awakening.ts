import type { ColorIndex } from "../state/color";

/** Roxo é o quinto e último estágio do Despertar da Masmorra. */
export const PURPLE_AWAKENING: ColorIndex = 4;

/** Uma concessão marcada Roxa só existe enquanto a masmorra está no Roxo. */
export function awakeningRequirementMet(
	despertar: ColorIndex,
	requiresAwakening: boolean | undefined,
): boolean {
	return !requiresAwakening || despertar === PURPLE_AWAKENING;
}

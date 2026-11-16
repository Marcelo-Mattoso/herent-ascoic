import type { Action } from "@/core/actions/types";

/** Observação de ciclo de vida, não prova de que o efeito executou. */
export type PreparedProbe = Readonly<Record<string, {
	readonly abilityId: string;
	readonly sourceKind: "hero" | "item" | "artifact";
}>>;

export interface PreparedTransitions {
	readonly armedHeroAbilities: readonly string[];
	readonly clearedDuringAttack: readonly string[];
	readonly clearedElsewhere: readonly string[];
}

const ATTACK_ACTIONS: ReadonlySet<Action["type"]> = new Set([
	"CHOOSE_TARGET", "ROLL_DICE", "PREPARE_PHYSICAL_ROLL",
	"CONFIRM_DICE_ROLL", "RESOLVE_ATTACK", "DIRECT_DAMAGE",
	"PREPARE_EXTRA_ATTACK",
]);

export function preparedTransitions(before: PreparedProbe | undefined,
	after: PreparedProbe | undefined, actionType: Action["type"]): PreparedTransitions {
	const was = before ?? {};
	const now = after ?? {};
	const armedHeroAbilities: string[] = [];
	const clearedDuringAttack: string[] = [];
	const clearedElsewhere: string[] = [];
	for (const [key, ability] of Object.entries(now)) {
		if (ability.sourceKind === "hero" && !was[key]) armedHeroAbilities.push(ability.abilityId);
	}
	for (const [key, ability] of Object.entries(was)) {
		if (ability.sourceKind !== "hero" || now[key]) continue;
		(ATTACK_ACTIONS.has(actionType) ? clearedDuringAttack : clearedElsewhere)
			.push(ability.abilityId);
	}
	return { armedHeroAbilities, clearedDuringAttack, clearedElsewhere };
}

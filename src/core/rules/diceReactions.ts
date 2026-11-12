import type { EffectNode } from "../skills/dsl/types";
import type { CombatRollResult } from "../state/combatState";

/** Dice reactions are resolved only after the dice have actually landed. */
export function hasDiceChangeEffect(effects: readonly EffectNode[] | undefined): boolean {
	return Boolean(effects?.some((effect) => {
		if (effect.kind === "i_reroll" || effect.kind === "i_set_die" || effect.kind === "i_modify_die") return true;
		if (effect.kind === "i_choose_one")
			return effect.options.some((option) => hasDiceChangeEffect(option.effect));
		if (effect.kind === "i_if")
			return hasDiceChangeEffect(effect.then) || hasDiceChangeEffect(effect.else);
		if (effect.kind === "i_for_each") return hasDiceChangeEffect(effect.do);
		return false;
	}));
}

/** Returns true only when a roll can be changed by at least one dice effect. */
export function canChangeRolledDice(
	effects: readonly EffectNode[] | undefined,
	roll: CombatRollResult | null | undefined,
): boolean {
	if (!roll || !effects) return false;
	return effects.some((effect) => {
		if (effect.kind === "i_choose_one")
			return effect.options.some((option) => canChangeRolledDice(option.effect, roll));
		if (effect.kind === "i_if")
			return canChangeRolledDice(effect.then, roll) || canChangeRolledDice(effect.else, roll);
		if (effect.kind === "i_for_each") return canChangeRolledDice(effect.do, roll);
		if (effect.kind !== "i_reroll" && effect.kind !== "i_set_die" && effect.kind !== "i_modify_die")
			return false;
		const dice = effect.die_side === "hero" ? [...roll.heroResults]
			: effect.die_side === "enemy" ? [...roll.enemyResults]
			: [...roll.heroResults, ...roll.enemyResults];
		if (!dice.length) return false;
		if (effect.kind === "i_reroll" && effect.only_if_value !== undefined)
			return typeof effect.only_if_value === "number"
				? dice.includes(effect.only_if_value)
				: true;
		if (effect.kind === "i_set_die" && typeof effect.value === "number")
			return dice.some((value) => value !== effect.value);
		if (effect.kind === "i_modify_die" && typeof effect.delta === "number")
			return effect.delta !== 0 && dice.some((value) =>
				[1, 2, 3, 4, 5, 6].some((next) =>
					next !== value && Math.abs(next - value) <= Math.abs(effect.delta as number)));
		return true;
	});
}

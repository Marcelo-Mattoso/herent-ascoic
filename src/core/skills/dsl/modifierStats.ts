import type { ModifierStatSpec } from "./kinds/shared";

export const BUILTIN_MODIFIER_STATS: Readonly<Record<string, ModifierStatSpec>> = {
	damage_reduction: { target: "damage_taken", negate: true },
	damage_bonus: { target: "damage_dealt" },
	tohit_bonus: { target: "hit_bonus" },
	tohit_penalty: { target: "hit_bonus", negate: true },
	dice_count: { target: "dice_count" },
	s_damage_reduction: { target: "damage_taken", negate: true, reduction: true },
	s_damage_dealt: { target: "damage_dealt" },
	s_hit_bonus: { target: "hit_bonus" },
	s_hit_penalty: { target: "hit_bonus", negate: true },
	s_damage_penalty: { target: "damage_dealt" },
};

export const ASCENSAO_MODIFIER_STATS: Readonly<Record<string, ModifierStatSpec>> =
	{
		s_poison_damage_reduction: { target: "poison_damage_taken", negate: true },
        s_poison_duration_increase: { target: "poison_duration_increase" },
        s_poison_duration_decrease: { target: "poison_duration_decrease" },
		s_purple_damage_reduction: {
			target: "purple_damage_taken",
			negate: true,
			dedup: false,
			damageType: "purple",
			reduction: true,
		},
	};

export const BUILTIN_DAMAGE_TYPES: readonly string[] = ["physical"];
export const ASCENSAO_DAMAGE_TYPES: readonly string[] = ["purple"];

export function isDamageReductionStat(stat: string): boolean {
	return (
		(BUILTIN_MODIFIER_STATS[stat] ?? ASCENSAO_MODIFIER_STATS[stat])
			?.reduction === true
	);
}

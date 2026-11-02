import type { ColorIndex } from "../state/color";

/** Cada linha é o perfil COMPLETO da cor: efeitos não acumulam. */
export interface DungeonAwakeningEffect {
	readonly hitBonus: number;
	readonly damageBonus: number;
	readonly armorPenetration: number;
	readonly purpleSkillsEnabled: boolean;
}

const EFFECTS: readonly DungeonAwakeningEffect[] = [
	{ hitBonus: 0, damageBonus: 0, armorPenetration: 0, purpleSkillsEnabled: false },
	{ hitBonus: 1, damageBonus: 0, armorPenetration: 0, purpleSkillsEnabled: false },
	{ hitBonus: 1, damageBonus: 1, armorPenetration: 0, purpleSkillsEnabled: false },
	{ hitBonus: 1, damageBonus: 1, armorPenetration: 1, purpleSkillsEnabled: false },
	{ hitBonus: 1, damageBonus: 1, armorPenetration: 1, purpleSkillsEnabled: true },
];

export function dungeonAwakeningEffect(level: ColorIndex): DungeonAwakeningEffect {
	return EFFECTS[level];
}

/** Penetração afeta somente a proteção positiva fornecida por equipamentos. */
export function piercedItemReduction(reduction: number, penetration: number): number {
	return Math.max(0, reduction - Math.min(Math.max(0, reduction), Math.max(0, penetration)));
}

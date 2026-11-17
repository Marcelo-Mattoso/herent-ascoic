import { getCardsByType } from "@/core/data/cards";
import { displayCardName, displaySkillName } from "@/i18n/catalogs";
import { translate } from "@/i18n";

/** A descrição vem das regras de neutralização, nunca de texto duplicado nas cartas. */
export function artifactRitualDescription(artifactId: string): string | null {
	for (const boss of getCardsByType("boss")) {
		const counter = boss.artifactCounters?.find((entry) => entry.artifactId === artifactId);
		if (!counter) continue;
		const effects: string[] = [];
		for (const stat of ["life", "hitBonus", "damage"] as const) {
			const amount = counter.removes?.[stat] ?? 0;
			if (amount > 0) effects.push(translate(`game:components.artifactRitual.${stat}`, { value: amount }));
		}
		for (const skillId of counter.disablesSkillIds ?? []) {
			effects.push(translate("game:components.artifactRitual.skill", { skill: displaySkillName(skillId) }));
		}
		return effects.length ? translate("game:components.artifactRitual.prefix", { boss: displayCardName(boss.id) }) + " " + effects.join(" ") : null;
	}
	return null;
}

import { parse } from "yaml";
import yamlText from "../../data/skills.yaml?raw";
import type { SkillCatalog } from "./skillTypes";
import { getEnabledExpansions } from "./expansions";

const legacy = parse(yamlText) as SkillCatalog;
const extra = getEnabledExpansions().flatMap((pack) => pack.skills ?? []);
const skillIds = new Set(legacy.abilities.map((skill) => skill.id));
for (const skill of extra) {
	if (skillIds.has(skill.id)) throw new Error("ID de habilidade duplicado: " + skill.id);
	skillIds.add(skill.id);
}
export const SKILLS: SkillCatalog = {
	...legacy,
	abilities: [...legacy.abilities, ...extra],
};

import type { SkillCatalog, SkillDefinition } from "./skillTypes";
import data from "../../data/skills.json";

export const SKILLS: SkillCatalog = data as SkillCatalog;

const _byId = new Map<string, SkillDefinition>(
	SKILLS.abilities.map((a) => [a.id, a]),
);

export function getSkillById(id: string): SkillDefinition | undefined {
	return _byId.get(id);
}

import { parse } from "yaml";
import localeText from "../../data/skills.locale.pt-BR.yaml?raw";

export interface SkillLocaleEntry {
	readonly name?: string;
	readonly label?: string;
	readonly text?: string;
	readonly options?: Readonly<Record<string, string>>;
}

export const SKILL_LOCALE: Readonly<Record<string, SkillLocaleEntry>> = parse(
	localeText,
) as Record<string, SkillLocaleEntry>;

export function getSkillLocale(skillId: string): SkillLocaleEntry {
	return SKILL_LOCALE[skillId] ?? {};
}

export function getSkillName(skillId: string): string {
	return SKILL_LOCALE[skillId]?.name ?? skillId;
}

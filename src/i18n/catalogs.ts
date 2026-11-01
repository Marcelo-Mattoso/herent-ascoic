import { i18n, translate } from "./index";
import { getCardLocale, type CardLocale } from "@/core/data/cardLocale";
import { getSkillLocale, type SkillLocaleEntry } from "@/core/data/skillLocale";

export function displayCardName(id: string): string {
	const field = getCardLocale(id)?.characterName ? "characterName" : "name";
	const key = `cards:${id}.${field}`;
	return i18n.exists(key) ? translate(key) : (getCardLocale(id)?.[field] ?? id);
}

export function displayCardClass(id: string): string {
	const key = `cards:${id}.name`;
	return i18n.exists(key) ? translate(key) : (getCardLocale(id)?.name ?? id);
}

export function displayHeroIdentity(id: string): string {
	const name = displayCardName(id);
	const cardClass = getCardLocale(id)?.characterName ? displayCardClass(id) : "";
	return cardClass ? `${name} — ${cardClass}` : name;
}

export function displayCardLocale(id: string): CardLocale | undefined {
	const fallback = getCardLocale(id);
	if (!fallback) return undefined;
	const translated = i18n.t(id, { ns: "cards", returnObjects: true });
	return translated && typeof translated === "object" ? translated as CardLocale : fallback;
}

export function displaySkillName(id: string): string {
	return translate(`skills:${id}.name`);
}

export function displaySkillLocale(id: string): SkillLocaleEntry {
	const fallback = getSkillLocale(id);
	const translated = i18n.t(id, { ns: "skills", returnObjects: true });
	return translated && typeof translated === "object" ? translated as SkillLocaleEntry : fallback;
}

export function tutorialText(moduleId: string, field: string): string {
	return translate(`tutorials:${moduleId}.${field}`);
}

export function tutorialNarration(moduleId: string, stepId: string, fallback: readonly string[]): readonly string[] {
	const value = i18n.t(`${moduleId}.steps.${stepId}.narration`, { ns: "tutorials", returnObjects: true });
	return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : fallback;
}

export function tutorialHighlight(moduleId: string, stepId: string, index: number, fallback: string): string {
	const value = i18n.t(`${moduleId}.steps.${stepId}.highlights`, { ns: "tutorials", returnObjects: true });
	return Array.isArray(value) && typeof value[index] === "string" ? value[index] : fallback;
}

// Renderiza label e texto de uma skill a partir do template + params da carta.
// Substitui a string livre `label` que vivia no card (Patch-13 Fase 5).

import type { SkillRef } from "../data/cardTypes";
import { lookupSkillById } from "./lookup";

function interpolate(template: string, params: Readonly<Record<string, number | string>>): string {
	return template.replace(/\{value\}/g, () => String(params.value ?? "?"));
}

export function renderSkillLabel(ref: SkillRef): string {
	const def = lookupSkillById(ref.skillId);
	if (!def) return ref.skillId;
	const params = { ...(def.params as Record<string, number | string> | undefined ?? {}), ...(ref.params ?? {}) };
	return interpolate(def.labelTemplate, params as Record<string, number | string>);
}

export function renderSkillText(ref: SkillRef): string {
	const def = lookupSkillById(ref.skillId);
	if (!def) return ref.skillId;
	const params = { ...(def.params as Record<string, number | string> | undefined ?? {}), ...(ref.params ?? {}) };
	return interpolate(def.textTemplate, params as Record<string, number | string>);
}

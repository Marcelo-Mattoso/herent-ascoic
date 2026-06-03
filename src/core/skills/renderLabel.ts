// Renderiza label e texto de uma skill a partir do locale + params da carta.
// Templates de copy vivem em src/data/skills.locale.pt-BR.yaml (patch-20).

import { getSkillLocale } from "../data/skillLocale";
import type { SkillRef } from "../data/cardTypes";
import { lookupSkillById } from "./lookup";

function interpolate(
	template: string,
	params: Readonly<Record<string, number | string>>,
): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const v = params[key];
		return v === undefined ? "?" : String(v);
	});
}

function mergedParams(
	ref: SkillRef,
): Record<string, number | string> {
	const def = lookupSkillById(ref.skillId);
	return {
		...((def?.params as Record<string, number | string> | undefined) ?? {}),
		...(ref.params ?? {}),
	};
}

export function renderSkillLabel(ref: SkillRef): string {
	const locale = getSkillLocale(ref.skillId);
	if (!locale.label) return ref.skillId;
	return interpolate(locale.label, mergedParams(ref));
}

export function renderSkillText(ref: SkillRef): string {
	const locale = getSkillLocale(ref.skillId);
	if (!locale.text) return ref.skillId;
	return interpolate(locale.text, mergedParams(ref));
}

// Renderiza label e texto de uma skill a partir do locale + params da carta.
// Exibição usa o catálogo i18n ativo (pt-BR como fallback).

import type { SkillRef } from "../data/cardTypes";
import { displaySkillLocale } from "@/i18n/catalogs";
import { skillById } from "../gameEngine";
import type { GameEngine } from "../gameEngine";


function interpolate(
	template: string,
	params: Readonly<Record<string, number | string>>,
): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const v = params[key];
		return v === undefined ? "?" : String(v);
	});
}

function mergedParams(engine: GameEngine, ref: SkillRef): Record<string, number | string> {
	const def = skillById(engine, ref.skillId);
	return {
		...((def?.params as Record<string, number | string> | undefined) ?? {}),
		...(ref.params ?? {}),
	};
}

export function renderSkillLabel(engine: GameEngine, ref: SkillRef): string {
	const locale = displaySkillLocale(ref.skillId);
	if (!locale.label) return ref.skillId;
	return interpolate(locale.label, mergedParams(engine, ref));
}

export function renderSkillText(engine: GameEngine, ref: SkillRef): string {
	const locale = displaySkillLocale(ref.skillId);
	if (!locale.text) return ref.skillId;
	return interpolate(locale.text, mergedParams(engine, ref));
}

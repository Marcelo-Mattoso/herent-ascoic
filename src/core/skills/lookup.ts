// Resolve qual SkillDefinition corresponde a (cardName, field).
// O catálogo skills.json é a fonte única de verdade — catálogo vence em caso de divergência.

import { SKILLS } from "../data/skills";
import { getCardById } from "../data/cards";
import type { SkillDefinition, SkillField } from "../data/skillTypes";

// Dois caches: um por id canônico, outro por nome PT-BR (compat até Fase 6 limpar callers)
const _byCardId = new Map<string, SkillDefinition>();   // "cardId::field"
const _byCardName = new Map<string, SkillDefinition>(); // "cardName::field"

function buildCache(): void {
	for (const ability of SKILLS.abilities) {
		for (const usage of ability.usedBy) {
			const idKey = `${usage.cardId}::${usage.field}`;
			if (!_byCardId.has(idKey)) {
				_byCardId.set(idKey, ability);
			}
			// Also index by card name for callers still using cardName (deprecated path)
			const card = getCardById(usage.cardId);
			if (card) {
				const nameKey = `${card.name}::${usage.field}`;
				if (!_byCardName.has(nameKey)) {
					_byCardName.set(nameKey, ability);
				}
			}
		}
	}
}

buildCache();

export function resolveSkillFor(
	cardName: string,
	field: SkillField,
): SkillDefinition | null {
	const key = `${cardName}::${field}`;
	return _byCardName.get(key) ?? null;
}

export function resolveSkillForById(
	cardId: string,
	field: SkillField,
): SkillDefinition | null {
	const key = `${cardId}::${field}`;
	return _byCardId.get(key) ?? null;
}

// Busca uma SkillDefinition pelo id único da skill.
export function lookupSkillById(id: string): SkillDefinition | null {
	return SKILLS.abilities.find((a) => a.id === id) ?? null;
}

// Retorna o `value` declarado em usedBy para o par (cardName, field).
export function resolveSkillValue(
	cardName: string,
	field: SkillField,
): number | string | null {
	for (const ability of SKILLS.abilities) {
		for (const usage of ability.usedBy) {
			const card = getCardById(usage.cardId);
			if (card?.name === cardName && usage.field === field) {
				return usage.value;
			}
		}
	}
	return null;
}

// Retorna o `value` pelo id canônico da carta.
export function resolveSkillValueById(
	cardId: string,
	field: SkillField,
): number | string | null {
	for (const ability of SKILLS.abilities) {
		const usage = ability.usedBy.find(
			(u) => u.cardId === cardId && u.field === field,
		);
		if (usage) return usage.value;
	}
	return null;
}

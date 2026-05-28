// Resolve qual SkillDefinition corresponde a (cardName, field).
// O catálogo skills.json é a fonte única de verdade — catálogo vence em caso de divergência.

import { SKILLS } from "../data/skills";
import type { SkillDefinition, SkillField } from "../data/skillTypes";

// Cache memoizado: "cardName::field" → SkillDefinition | null
const _cache = new Map<string, SkillDefinition | null>();

function buildCache(): void {
	for (const ability of SKILLS.abilities) {
		for (const usage of ability.usedBy) {
			const key = `${usage.card}::${usage.field}`;
			if (!_cache.has(key)) {
				_cache.set(key, ability);
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
	if (_cache.has(key)) return _cache.get(key) ?? null;
	return null;
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
		const usage = ability.usedBy.find(
			(u) => u.card === cardName && u.field === field,
		);
		if (usage) return usage.value;
	}
	return null;
}

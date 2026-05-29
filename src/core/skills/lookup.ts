// Resolve SkillDefinitions a partir dos dados de composição em cards.json.
// cards.json é a fonte única de composição (card → skill refs).
// skills.json é a fonte única de comportamento e templates.

import { SKILLS } from "../data/skills";
import { getAllCards } from "../data/cards";
import type { SkillDefinition } from "../data/skillTypes";
import type { SkillRef } from "../data/cardTypes";

interface ResolvedSkillRef {
	def: SkillDefinition;
	ref: SkillRef;
}

// Índices derivados de cards.json
const _byCardId = new Map<string, ResolvedSkillRef[]>(); // cardId → refs resolvidas
const _bySkillId = new Map<string, string[]>();           // skillId → cardIds que a usam

function buildCache(): void {
	for (const card of getAllCards()) {
		const refs: ResolvedSkillRef[] = [];
		const rawRefs: SkillRef[] = "skills" in card && Array.isArray(card.skills)
			? (card.skills as SkillRef[])
			: [];

		for (const ref of rawRefs) {
			const def = SKILLS.abilities.find((a) => a.id === ref.skillId);
			if (!def) {
				throw new Error(`skillId "${ref.skillId}" em ${card.id} não existe em skills.json`);
			}
			refs.push({ def, ref });
			const existing = _bySkillId.get(ref.skillId);
			if (existing) {
				if (!existing.includes(card.id)) existing.push(card.id);
			} else {
				_bySkillId.set(ref.skillId, [card.id]);
			}
		}

		if (refs.length > 0) _byCardId.set(card.id, refs);
	}
}

buildCache();

/** Retorna todos os { def, ref } de um card pelo id canônico. */
export function cardSkills(cardId: string): ResolvedSkillRef[] {
	return _byCardId.get(cardId) ?? [];
}

/** Retorna a lista de cardIds que referenciam a skill. */
export function skillUsedBy(skillId: string): string[] {
	return _bySkillId.get(skillId) ?? [];
}

/** Busca uma SkillDefinition pelo id único da skill. */
export function lookupSkillById(id: string): SkillDefinition | null {
	return SKILLS.abilities.find((a) => a.id === id) ?? null;
}

import { parse } from "yaml";
import abilitiesYaml from "../../data/abilities.yaml?raw";
import type {
	AbilityActivation,
	AbilityCatalog,
	AbilityDefinition,
	AbilityGrant,
} from "./abilityTypes";
import { getAllCards, getCardById } from "./cards";
import type { AnyCard, SkillRef } from "./cardTypes";
import { SKILLS } from "./skills";
import type { SkillDefinition } from "./skillTypes";
import { AbilityCatalogSchema, AbilityGrantSchema } from "../skills/dsl/schema";

const authoredCatalog = AbilityCatalogSchema.parse(
	parse(abilitiesYaml),
) as AbilityCatalog;

function legacyAbility(definition: SkillDefinition): AbilityDefinition {
	return {
		id: definition.id,
		nature: definition.nature,
		defaultParams: definition.params,
		targetContract: { required: definition.target_type !== "tgt_none" },
		effect: definition.effect,
		script: definition.script,
	};
}

function legacyActivation(
	card: AnyCard,
	definition: SkillDefinition,
): AbilityActivation {
	const targeting = {
		targetType: definition.target_type,
		affectScope: definition.affect_scope,
		affectObject: definition.affect_object,
		affectLimit: definition.affect_limit,
	};
	const common = {
		conditions: definition.conditions,
		limit: definition.cooldown
			? {
					scope: definition.cooldown.scope,
					maxUses: definition.cooldown.charges,
				}
			: undefined,
		cost: definition.cost
			? { hp: definition.cost.hp, mp: definition.cost.mp }
			: undefined,
		targeting,
	};

	if (definition.operate_type === "op_passive") {
		return { kind: "continuous", ...common };
	}
	if (definition.operate_type === "op_triggered") {
		return {
			kind: "event",
			event: definition.trigger!.event,
			window: definition.trigger?.window,
			decision:
				definition.interrupt?.mode === "prompt" || card.type === "hero"
					? "optional"
					: "automatic",
			priority: definition.interrupt?.priority,
			actionCost: "none",
			consumeSource:
				card.type === "item" && card.itemClass === "consumable"
					? "discard"
					: "none",
			...common,
		};
	}

	return {
		kind: "manual",
		decision: "required",
		actionCost: card.type === "hero" ? "consume_hero_action" : "none",
		consumeSource:
			card.type === "item" && card.itemClass === "consumable"
				? "discard"
				: "none",
		...common,
	};
}

function legacyGrant(
	card: AnyCard,
	ref: SkillRef,
	definition: SkillDefinition,
	index: number,
): AbilityGrant {
	return {
		id: `legacy:${card.id}:${index}:${ref.skillId}`,
		abilityId: definition.id,
		params: ref.params,
		requiresAwakening: ref.requiresAwakening,
		activation: legacyActivation(card, definition),
	};
}

const legacyById = new Map(
	SKILLS.abilities.map((definition) => [definition.id, legacyAbility(definition)]),
);
const authoredById = new Map(
	authoredCatalog.abilities.map((ability) => [ability.id, ability]),
);

/**
 * Catálogo de leitura durante a migração. Uma entrada em abilities.yaml ganha
 * precedência sobre a versão normalizada de skills.yaml com o mesmo id.
 */
export const ABILITIES: AbilityCatalog = {
	version: authoredCatalog.version,
	abilities: [...new Map([...legacyById, ...authoredById]).values()],
};

const explicitGrantsByCardId = new Map<string, readonly AbilityGrant[]>();
for (const card of getAllCards()) {
	if (!card.grants || card.grants.length === 0) continue;
	const grants = card.grants.map((grant) =>
		AbilityGrantSchema.parse(grant),
	) as readonly AbilityGrant[];
	for (const grant of grants) {
		if (!ABILITIES.abilities.some((ability) => ability.id === grant.abilityId)) {
			throw new Error(
				`Grant ${grant.id} em ${card.id} referencia ability inexistente: ${grant.abilityId}`,
			);
		}
	}
	explicitGrantsByCardId.set(card.id, grants);
}

export function lookupAbilityById(id: string): AbilityDefinition | null {
	return ABILITIES.abilities.find((ability) => ability.id === id) ?? null;
}

/**
 * Adaptador de transição: cards com grants usam o formato novo; cartas sem
 * grants continuam expondo suas SkillRefs legadas como AbilityGrants.
 */
export function cardAbilityGrants(cardId: string): readonly AbilityGrant[] {
	const card = getCardById(cardId);
	if (!card) return [];
	const explicitGrants = explicitGrantsByCardId.get(cardId);
	if (explicitGrants) return explicitGrants;

	return card.skills.flatMap((ref, index) => {
		const definition = SKILLS.abilities.find((entry) => entry.id === ref.skillId);
		return definition ? [legacyGrant(card, ref, definition, index)] : [];
	});
}

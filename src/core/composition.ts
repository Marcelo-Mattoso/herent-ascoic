import packageJson from "../../package.json";
import eventRules from "../data/event_rules.json";
import transitions from "../data/transitions.json";
import { seededDice } from "../engine/dice";
import { createEngine } from "../engine/compose";
import { createKindRegistryFrom } from "../engine/kinds";
import { createPhaseFlow, transitionsFromMap } from "../engine/phases";
import { createScopeRegistry } from "../engine/scopes";
import {
	ABILITIES,
	cardAbilityGrants,
	lookupAbilityById,
} from "./data/abilities";
import { getCardLocale } from "./data/cardLocale";
import { getAllCards, getCardById, getCardsByType } from "./data/cards";
import type { AnyCard, SkillRef } from "./data/cardTypes";
import { getSkillLocale } from "./data/skillLocale";
import { SKILLS } from "./data/skills";
import type { SkillDefinition } from "./data/skillTypes";
import {
	BACKPACK_LIMIT,
	DIFFICULTY_PRESETS,
	DUNGEON_EXHAUSTION_COST,
	FEATURE_FLAGS,
	XP_COSTS,
} from "./config/defaults";
import type {
	GameBalance,
	GameContent,
	GameEngine,
	GameFlow,
	GameKinds,
	GameTransitions,
	ResolveCtx,
} from "./gameEngine";
import { ascensaoHandlers } from "./reducer/handlers";
import { ascensaoPackage } from "./skills/dsl/kinds/ascensao";
import { builtinPackage } from "./skills/dsl/kinds/builtin";
import { asKindNode } from "./skills/dsl/kinds/shared";
import type { EvalCtx } from "./skills/dsl/types";
import { createScriptRegistry } from "./scripts/registry";
import { awakeningRequirementMet } from "./rules/awakening";
import type { Action } from "./actions/types";
import { gameOf } from "../engine/state";
import type { GameState } from "./state/gameState";
import { GAME_SCOPE_DEFS } from "./state/scopes";

import { awakeningOf } from "./state/access";
const skillDefsById = new Map<string, SkillDefinition>(
	SKILLS.abilities.map((definition) => [definition.id, definition]),
);

function skillRefsOf(cardId: string): { def: SkillDefinition; ref: SkillRef }[] {
	const card = getCardById(cardId);
	if (!card || !("skills" in card) || !Array.isArray(card.skills)) return [];
	return (card.skills as SkillRef[]).map((ref) => {
		const def = skillDefsById.get(ref.skillId);
		if (!def) {
			throw new Error(
				`skillId "${ref.skillId}" em ${card.id} não existe em skills.yaml`,
			);
		}
		return { def, ref };
	});
}

function text(key: string, params: Record<string, unknown> = {}): string {
	const id = String(params["id"] ?? "");
	switch (key) {
		case "card.name":
			return getCardLocale(id)?.name ?? id;
		case "card.dungeonScaling":
			return getCardLocale(id)?.dungeonScaling ?? "";
		case "ability.name":
			return getSkillLocale(id).name ?? id;
		case "ability.text": {
			const locale = getSkillLocale(id);
			return locale.text ?? locale.notes ?? "";
		}
		case "ability.option": {
			const option = String(params["option"] ?? "");
			return getSkillLocale(id).options?.[option] ?? option;
		}
		default:
			throw new Error(`Chave de texto desconhecida: ${key}`);
	}
}

const scripts = createScriptRegistry(
	import.meta.glob<Record<string, unknown>>("/src/data/scripts/*.ts", {
		eager: true,
	}),
);

const content: GameContent = {
	card(id) {
		const card = getCardById(id);
		if (!card) throw new Error(`Carta inexistente: ${id}`);
		return card;
	},
	hasCard: (id) => getCardById(id) !== undefined,
	cards: () => getAllCards(),
	cardsOfType: (type) => getCardsByType(type),
	abilitiesOf: skillRefsOf,
	ability(id) {
		const definition = skillDefsById.get(id);
		if (!definition) throw new Error(`Habilidade inexistente: ${id}`);
		return definition;
	},
	hasAbility: (id) => skillDefsById.has(id),
	grants: cardAbilityGrants,
	abilityDef: lookupAbilityById,
	script: scripts.get,
	continuationOf: scripts.continuationOf,
	text,
};

const balance: GameBalance = {
	xpCosts: XP_COSTS,
	dungeonExhaustionCost: DUNGEON_EXHAUSTION_COST,
	difficultyPresets: DIFFICULTY_PRESETS,
	backpackLimit: BACKPACK_LIMIT,
	featureFlags: FEATURE_FLAGS,
};

const scopeRegistry = createScopeRegistry(GAME_SCOPE_DEFS);

function nodesOfSkill(definition: SkillDefinition) {
	return [
		...(definition.effect ?? []),
		...(definition.conditions ?? []).map(asKindNode),
	];
}

function validateAuthoredContent(kinds: GameKinds): void {
	for (const ability of ABILITIES.abilities) {
		kinds.validateAll(ability.effect ?? [], `habilidade ${ability.id}`);
	}
	for (const definition of SKILLS.abilities) {
		kinds.validateAll(nodesOfSkill(definition), `skill ${definition.id}`);
		const damageType = definition.rules?.damageType;
		if (
			damageType !== undefined &&
			kinds.ref("damage_type", damageType, undefined as never) === undefined
		) {
			throw new Error(
				`skill ${definition.id}: damageType "${damageType}" sem resolvedor registrado`,
			);
		}
	}
	for (const card of getAllCards()) {
		for (const grant of cardAbilityGrants(card.id)) {
			kinds.validateAll(
				(grant.activation.conditions ?? []).map(asKindNode),
				`carta ${card.id} > grant ${grant.id}`,
			);
		}
	}
}

export function createAscensaoKinds(): GameKinds {
	return createKindRegistryFrom<GameState, ResolveCtx, EvalCtx>(
		builtinPackage,
		ascensaoPackage,
	);
}

export function createAscensaoEngine(): GameEngine {
	const kinds = createAscensaoKinds();
	const engine = createEngine<
		GameState,
		AnyCard,
		SkillDefinition,
		GameBalance,
		GameTransitions,
		GameContent,
		GameKinds,
		GameFlow
	>({
		kinds,
		nodesOf: nodesOfSkill,
		ruleset: {
			id: "ascensao-heroica",
			version: packageJson.version,
			balance: structuredClone(balance),
			transitions: structuredClone(transitions) as GameTransitions,
			eventRules: structuredClone(eventRules),
		},
		content,
		dice: seededDice,
		requirements: {
			met(state, req) {
				if (req.kind === "awakening") {
					return awakeningRequirementMet(
						awakeningOf(state),
						req["required"] !== false,
					);
				}
				throw new Error(`Requisito desconhecido: ${req.kind}`);
			},
		},
		scopes: {
			registry: scopeRegistry,
			key: (_state, scope, src) => `${scope}:${src.kind}:${src.id}`,
		},
		flow: createPhaseFlow({
			phaseOf: (state) => gameOf(state).status,
			handlers: ascensaoHandlers,
			transitions: [
				...transitionsFromMap<GameState, Action>(transitions),
				{ from: "*", on: "START_GAME", to: "*" },
			],
			onInvalidTransition: "apply-and-report",
		}),
	});
	validateAuthoredContent(kinds);
	return engine;
}

// Modelo vNext: a habilidade descreve somente o efeito; a concessão descreve
// como uma fonte concreta (carta, item, herói etc.) pode ativá-lo.

import type {
	AffectLimit,
	AffectObject,
	AffectScope,
	ConditionNode,
	CooldownScope,
	EffectNode,
	EventName,
	Nature,
	TargetType,
} from "../skills/dsl/types";
import type { TriggerWindow } from "../triggers/engine";

export interface AbilityParameterDefinition {
	readonly type: "integer" | "number" | "string" | "boolean";
	readonly minimum?: number;
	readonly maximum?: number;
	readonly required?: boolean;
}

/**
 * Comportamento canônico, independente de quem o concede ou de quando ele é
 * disparado. Cada ability possui exatamente um effect DSL ou um script.
 */
export interface AbilityDefinition {
	readonly id: string;
	readonly nature?: readonly Nature[];
	readonly parameters?: Readonly<Record<string, AbilityParameterDefinition>>;
	readonly defaultParams?: Readonly<Record<string, unknown>>;
	readonly targetContract?: {
		readonly required?: boolean;
	};
	readonly effect?: readonly EffectNode[];
	readonly script?: string;
}

export interface AbilityCatalog {
	readonly version: string;
	readonly abilities: readonly AbilityDefinition[];
}

export type AbilityActivationKind =
	| "manual"
	| "event"
	| "continuous"
	| "on_enter_play";

export type AbilityDecision = "automatic" | "optional" | "required";

export type AbilityActionCost = "none" | "consume_hero_action";

export type SourceConsumption = "none" | "discard" | "remove";

export interface AbilityTargeting {
	readonly targetType: TargetType;
	readonly affectScope: AffectScope;
	readonly affectObject: AffectObject;
	readonly affectLimit?: AffectLimit;
}

/** Metadados de ativação que pertencem à fonte, não ao efeito. */
export interface AbilityActivation {
	readonly kind: AbilityActivationKind;
	/** Obrigatório quando kind = event. */
	readonly event?: EventName;
	readonly window?: TriggerWindow;
	readonly decision?: AbilityDecision;
	readonly priority?: number;
	readonly conditions?: readonly ConditionNode[];
	readonly limit?: {
		readonly scope: CooldownScope;
		readonly maxUses: number;
	};
	readonly cost?: {
		readonly hp?: number;
		readonly mp?: number;
	};
	readonly actionCost?: AbilityActionCost;
	readonly consumeSource?: SourceConsumption;
	readonly targeting?: AbilityTargeting;
}

/**
 * Uma instância de disponibilidade da ability em uma fonte. O id é local à
 * fonte e será a chave de limite/recarga; nunca use apenas abilityId para isso.
 */
export interface AbilityGrant {
	readonly id: string;
	readonly abilityId: string;
	readonly params?: Readonly<Record<string, unknown>>;
	readonly requiresAwakening?: boolean;
	readonly activation: AbilityActivation;
}

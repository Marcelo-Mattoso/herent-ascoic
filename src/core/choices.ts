import type { PendingChoice, PendingResolution } from "../engine/choice";
import type { ChoiceOption, PausedState, PendingEffect } from "./effects/stack";
import type { PendingSkillWindow } from "./skills/resolveSkillWindow";
import type { TargetCandidate } from "./data/skillTypes";
import type { PendingTriggerInterrupt } from "./triggers/engine";

export const PARTY_PLAYER = "party";

export function pausedFromLegacy(
	reason: string,
	options: readonly ChoiceOption[],
	resumeFrom: PendingEffect,
): PausedState {
	return {
		choice: {
			id: reason,
			player: PARTY_PLAYER,
			options: options.map((option) => option.id),
			min: 1,
			max: 1,
			data: { labels: Object.fromEntries(options.map((o) => [o.id, o.label])) },
		},
		resumeFrom,
	};
}

export interface PendingSkillTarget {
	readonly skillId: string;
	readonly sourceId: string;
	readonly prompt: string;
	readonly candidates: readonly TargetCandidate[];
}

export interface PendingSkillChoice {
	readonly skillId: string;
	readonly prompt: string;
	/** Só escolhas explicitamente opcionais podem usar __skip__. */
	readonly allowSkip?: boolean;
	/** Escolha de cartas reveladas: permite guardar uma ou descartar individualmente. */
	readonly kind?: "draw_and_choose";
	readonly discardDeck?: "itemDeck" | "artifactDeck";
	readonly options: readonly {
		readonly id: string;
		readonly label: string;
		readonly params?: Readonly<Record<string, number | string>>;
		/** DSL: efeito a avaliar quando esta opção for escolhida (Patch-12 Lote 3+). */
		readonly effect?: readonly import("./skills/dsl/types").EffectNode[];
	}[];
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
	readonly sourceCardId?: string;
	readonly sourceEntityId?: string;
	readonly targetHeroIds?: readonly string[];
	readonly targetEnemyIds?: readonly string[];
	/** Snapshot completo do contexto que abriu a escolha. */
	readonly context?: import("./data/skillTypes").SkillContext;
}

export interface PendingBundle {
	readonly paused?: PausedState;
	readonly skillTarget?: PendingSkillTarget;
	readonly skillChoice?: PendingSkillChoice;
	readonly triggerInterrupt?: PendingTriggerInterrupt;
	readonly skillWindow?: PendingSkillWindow;
}

export function choicesOfBundle(bundle: PendingBundle): readonly PendingChoice[] {
	const choices: PendingChoice[] = [];
	if (bundle.paused) choices.push(bundle.paused.choice);
	const target = bundle.skillTarget;
	if (target) {
		choices.push({
			id: `target:${target.skillId}`,
			player: PARTY_PLAYER,
			options: target.candidates.map((candidate) => candidate.id),
			min: 1,
			max: 1,
			data: { sourceId: target.sourceId, prompt: target.prompt },
		});
	}
	const choice = bundle.skillChoice;
	if (choice) {
		const options = choice.options.map((option) => option.id);
		choices.push({
			id: `choice:${choice.skillId}`,
			player: PARTY_PLAYER,
			options,
			min: choice.allowSkip ? 0 : 1,
			max: choice.kind === "draw_and_choose" ? options.length : 1,
			data: { prompt: choice.prompt },
		});
	}
	const interrupt = bundle.triggerInterrupt;
	if (interrupt) {
		choices.push({
			id: `interrupt:${interrupt.id}`,
			player: PARTY_PLAYER,
			options: ["accept", "decline"],
			min: 1,
			max: 1,
			data: { skillId: interrupt.skillId, window: interrupt.window },
		});
	}
	const window = bundle.skillWindow;
	if (window) {
		choices.push({
			id: `window:${window.event}`,
			player: PARTY_PLAYER,
			options: [],
			min: 0,
			max: 0,
		});
	}
	return choices;
}

export function pendingResolutionOf(
	bundle: PendingBundle,
): PendingResolution | undefined {
	const [primary] = choicesOfBundle(bundle);
	if (!primary) return undefined;
	return { choice: { ...primary, data: bundle }, stack: [] };
}

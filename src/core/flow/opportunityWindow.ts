import type { GameState } from "../state/gameState";
import { collectOpportunityInterrupts } from "../skills/resolveSkillWindow";
import type { PendingTriggerInterrupt } from "../triggers/engine";

export type GameFlowPhase =
	| "turn_start"
	| "attack_start"
	| "pre_roll"
	| "roll"
	| "post_roll"
	| "attack_resolution"
	| "post_resolution"
	| "attack_end"
	| "non_combat";

export interface AvailableAction {
	readonly actionId: string;
	readonly sourceType: PendingTriggerInterrupt["sourceKind"];
	readonly sourceId: string;
	readonly sourceOwnerId?: string;
	readonly actionType: "activate";
	readonly label: string;
	readonly validTargetIds: readonly string[];
}

export interface OpportunityWindow {
	readonly windowId: string;
	readonly phase: GameFlowPhase;
	readonly activeActorId?: string;
	readonly availableActions: readonly AvailableAction[];
	readonly canPass: true;
}

function phaseFor(pending: PendingTriggerInterrupt): GameFlowPhase {
	switch (pending.window) {
		case "before_attack_roll":
			return "pre_roll";
		case "after_roll_before_result":
			return "post_roll";
		case "before_damage":
		case "before_destroy":
			return "post_resolution";
		case "after_damage":
		case "on_destroy":
			return "post_resolution";
		case "round_start":
			return "turn_start";
		case "round_end":
			return "attack_end";
		default:
			return "non_combat";
	}
}

/** Projeção autoritativa da interrupção legada como janela de oportunidade. */
export function deriveOpportunityWindow(
	state: GameState,
): OpportunityWindow | null {
	const pending = state.pendingTriggerInterrupt;
	if (!pending) return null;
	const skillWindow = state.pendingSkillWindow;
	const interrupts = skillWindow
		? collectOpportunityInterrupts(state, skillWindow)
		: [pending];
	const windowId = skillWindow
		? `${skillWindow.event}:${skillWindow.ctx.sourceHeroId ?? skillWindow.ctx.sourceEnemyId ?? "group"}:${skillWindow.ctx.round ?? 0}`
		: pending.id;
	return {
		windowId,
		phase: phaseFor(pending),
		activeActorId: pending.sourceHeroId ?? pending.sourceEnemyId,
		canPass: true,
		availableActions: interrupts.map((entry) => ({
			actionId: entry.id,
			sourceType: entry.sourceKind,
			sourceId: entry.sourceCardId,
			sourceOwnerId: entry.sourceHeroId,
			actionType: "activate",
			label: entry.skillId,
			validTargetIds: [
				...(entry.targetHeroIds ?? []),
				...(entry.targetEnemyIds ?? []),
			],
		})),
	};
}

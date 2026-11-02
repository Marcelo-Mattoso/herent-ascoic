import { canStartHeroAttack } from "../rules/attackAvailability";
import { scopedFlagOf } from "../state/access";
import { manualItemOptions } from "../rules/itemEffects";
import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { playerView } from "./playerView";
import type { GameEngine } from "../gameEngine";
import { gameOf } from "../../engine/state";

export interface HeroCombatActions {
	readonly canStartAttack?: boolean;
	readonly usableItems?: ReturnType<typeof manualItemOptions>;
	readonly canAttack: boolean;
	readonly canPass: boolean;
	readonly canCancel: boolean;
	readonly canUsePower: boolean;
	readonly canUseSkill: boolean;
	readonly canFlee: boolean;
	readonly fleeAlreadyDeclared: boolean;
	readonly skill: {
		readonly skillId: string;
		readonly activatable: boolean;
		readonly alreadyUsed: boolean;
		readonly prepared: boolean;
		readonly preparable: boolean;
		readonly reason?: string;
	} | null;
	readonly power: {
		readonly skillId: string;
		readonly activatable: boolean;
		readonly alreadyUsed: boolean;
		readonly prepared: boolean;
		readonly preparable: boolean;
		readonly reason?: string;
	} | null;
}

// Descritores de ação de combate para um herói específico.
// Centraliza a habilitação de botões, consumindo predicados do core.
export function selectHeroCombatActions(engine: GameEngine, 
	state: GameState,
	heroId: string,
): HeroCombatActions {
	const view = playerView(engine, state);
	const hero = view.heroes.find((h) => h.id === heroId) ?? null;
	const combat = view.combat;
	const isInCombat =
		gameOf(state).status === "HERO_ACTION" || gameOf(state).status === "BOSS_COMBAT";

	const isSelectingTarget =
		combat?.phase === "selecting_target" && combat.selectedHeroId === heroId;
	const heroActionUnavailable =
		hero === null ||
		(isInCombat && ActivationTracker.isHeroDisabledThisRound(state, heroId));

	const canStartAttack = canStartHeroAttack(state, heroId);
	const canAttack = isSelectingTarget && canStartAttack;
	const canPass = isSelectingTarget && !heroActionUnavailable;
	const canCancel = isSelectingTarget;
	const canFlee =
		hero !== null &&
		!heroActionUnavailable &&
		hero.currentLife === 1 &&
		!gameOf(state).flags["fleeBlocked"];

	const skillAction = view.abilityActionsByHero[heroId]?.find((action) => action.kind === "skill");
	const skill = skillAction
		? {
				skillId: skillAction.abilityId,
				activatable: skillAction.activation !== "passive",
				alreadyUsed: skillAction.status === "exhausted" || skillAction.status === "unavailable",
				prepared: skillAction.status === "prepared",
				preparable: skillAction.activation === "prepare",
				reason: skillAction.reason,
			}
		: null;
	const powerAction = view.abilityActionsByHero[heroId]?.find((action) => action.kind === "power");
	const power = powerAction
		? {
				skillId: powerAction.abilityId,
				activatable: powerAction.activation !== "passive",
				alreadyUsed: powerAction.status === "exhausted" || powerAction.status === "unavailable",
				prepared: powerAction.status === "prepared",
				preparable: powerAction.activation === "prepare",
				reason: powerAction.reason,
			}
		: null;
	const canUseSkill = Boolean(skillAction && (skillAction.status === "available" || skillAction.status === "prepared"));
	const canUsePower = Boolean(powerAction && (powerAction.status === "available" || powerAction.status === "prepared"));

	const fleeAlreadyDeclared =
		gameOf(state).combat !== null &&
		scopedFlagOf(state, "combat", "fleeAttempt", heroId);

	return {
		canAttack,
		canStartAttack,
		usableItems: manualItemOptions(engine, state, heroId),
		canPass,
		canCancel,
		canUsePower,
		canUseSkill,
		canFlee,
		fleeAlreadyDeclared,
		skill,
		power,
	};
}

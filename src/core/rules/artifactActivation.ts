import type { Action } from "../actions/types";
import {
	canExecuteAbilityGrant,
	resolveManualGrantTarget,
	type AbilityGrantSource,
} from "../abilities/executor";
import { abilityGrants, cardName, type GameEngine } from "../gameEngine";
import { enemiesOf, heroesOf, pausedOf, pendingSkillChoiceOf, pendingSkillTargetOf, pendingTriggerInterruptOf } from "../state/access";
import type { GameState } from "../state/gameState";
import { gameOf } from "../../engine/state";

export interface ArtifactTarget {
	readonly id: string;
	readonly kind: "enemy" | "hero";
	readonly label: string;
}

export interface ManualArtifactAction {
	readonly artifactId: string;
	readonly abilityId: string;
	readonly available: boolean;
	readonly reason?: string;
	readonly requiresTarget: boolean;
	readonly targets: readonly ArtifactTarget[];
}

function sourceFor(artifact: { readonly cardId: string; readonly carriedBy: string | null }): AbilityGrantSource {
	return {
		kind: "artifact",
		cardId: artifact.cardId,
		...(artifact.carriedBy ? { sourceHeroId: artifact.carriedBy } : {}),
	};
}

function actionWindowReason(state: GameState): string | null {
	if (pausedOf(state) || pendingSkillChoiceOf(state) || pendingSkillTargetOf(state) || pendingTriggerInterruptOf(state))
		return "Conclua a escolha pendente primeiro.";
	const game = gameOf(state);
	if (!["HERO_ACTION", "BOSS_COMBAT"].includes(game.status) ||
		!game.combat || !["selecting_hero", "selecting_target"].includes(game.combat.phase))
		return "Disponível durante uma janela de ação do combate.";
	return null;
}

/** Source of truth for the UI, legal actions and bots. Passive/event artifacts are excluded. */
export function projectManualArtifactActions(engine: GameEngine, state: GameState): ManualArtifactAction[] {
	const windowReason = actionWindowReason(state);
	return gameOf(state).groupArtifacts.flatMap((artifact) =>
		abilityGrants(engine, artifact.cardId)
			.filter((grant) => grant.activation.kind === "manual")
			.map((grant): ManualArtifactAction => {
				const source = sourceFor(artifact);
				const resolution = resolveManualGrantTarget(engine, state, source, grant);
				const potential: ArtifactTarget[] = resolution.kind === "needs_selection"
					? resolution.candidates.filter((candidate) => candidate.kind === "hero" || candidate.kind === "enemy")
						.map((candidate) => ({ id: candidate.id, kind: candidate.kind as "hero" | "enemy", label: candidate.label }))
					: resolution.kind === "ready"
						? resolution.targetIds.flatMap((id): ArtifactTarget[] => {
							const hero = heroesOf(state).find((unit) => unit.id === id && unit.status === "active");
							if (hero) return [{ id, kind: "hero", label: cardName(engine, hero.cardId) }];
							const enemy = enemiesOf(state).find((unit) => unit.id === id && unit.status === "active");
							return enemy ? [{ id, kind: "enemy", label: cardName(engine, enemy.cardId) }] : [];
						})
						: [];
				const requiresTarget = resolution.kind !== "unavailable" &&
					(resolution.kind === "needs_selection" || resolution.targetIds.length > 0);
				const candidates = potential;
				const targets = candidates.filter((target) =>
					canExecuteAbilityGrant(engine, state, source, grant, "manual", undefined, [target.id]) === null);
				const availableWithoutTarget = !requiresTarget && resolution.kind === "ready" &&
					canExecuteAbilityGrant(engine, state, source, grant, "manual", undefined, []) === null;
				const reason = windowReason ??
					(resolution.kind === "unavailable" ? resolution.reason :
						(requiresTarget && targets.length === 0 || !requiresTarget && !availableWithoutTarget)
								? canExecuteAbilityGrant(engine, state, source, grant, "manual", undefined,
									candidates[0] ? [candidates[0].id] : []) ??
									"Nenhum alvo válido disponível."
								: null);
				return {
					artifactId: artifact.cardId,
					abilityId: grant.abilityId,
					available: !reason,
					...(reason ? { reason } : {}),
					requiresTarget,
					targets,
				};
			}),
	);
}

export function legalArtifactActions(engine: GameEngine, state: GameState): Action[] {
	return projectManualArtifactActions(engine, state).filter((entry) => entry.available)
		.flatMap((entry): Action[] => {
			if (!entry.requiresTarget) return [{ type: "USE_ARTIFACT", payload: {
				artifactId: entry.artifactId, abilityId: entry.abilityId,
			} }];
			return entry.targets.map((target): Action => ({ type: "USE_ARTIFACT", payload: {
				artifactId: entry.artifactId,
				abilityId: entry.abilityId,
				...(target.kind === "enemy" ? { targetEnemyId: target.id } : { targetHeroId: target.id }),
			} }));
		});
}

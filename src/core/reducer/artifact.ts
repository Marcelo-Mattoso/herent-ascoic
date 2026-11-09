import type { GameHandler } from "../gameEngine";
import { abilityGrants } from "../gameEngine";
import { executeAbilityGrant } from "../abilities/executor";
import { gameOf } from "../../engine/state";
import { legalArtifactActions } from "../rules/artifactActivation";
import { log } from "./utils";

/** The same allowed actions feed the on-screen controls and the bot. */
export const artifactHandler: GameHandler = {
	id: "artifact-activation",
	phases: ["HERO_ACTION", "BOSS_COMBAT"],
	actions: ["USE_ARTIFACT"],
	legalActions(state, _player, engine) {
		return legalArtifactActions(engine, state);
	},
	apply(state, action, engine) {
		if (action.type !== "USE_ARTIFACT") return state;
		const wanted = action.payload;
		const allowed = legalArtifactActions(engine, state).some((candidate) =>
			candidate.type === "USE_ARTIFACT" &&
			candidate.payload.artifactId === wanted.artifactId &&
			candidate.payload.abilityId === wanted.abilityId &&
			candidate.payload.targetEnemyId === wanted.targetEnemyId &&
			candidate.payload.targetHeroId === wanted.targetHeroId);
		if (!allowed) return log(state, "[AVISO] Ação ou alvo do artefato indisponível nesta janela.");
		const artifact = gameOf(state).groupArtifacts.find((entry) => entry.cardId === wanted.artifactId);
		const grant = abilityGrants(engine, wanted.artifactId).find((entry) =>
			entry.abilityId === wanted.abilityId && entry.activation.kind === "manual");
		if (!artifact || !grant) return log(state, "[AVISO] Artefato não pertence ao grupo.");
		return executeAbilityGrant(engine, state, {
			source: {
				kind: "artifact",
				cardId: artifact.cardId,
				...(artifact.carriedBy ? { sourceHeroId: artifact.carriedBy } : {}),
			},
			grant,
			triggeredBy: "manual",
			targetIds: wanted.targetEnemyId ? [wanted.targetEnemyId] :
				wanted.targetHeroId ? [wanted.targetHeroId] : [],
		});
	},
};

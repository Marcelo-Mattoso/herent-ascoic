import type { GameHandler } from "../gameEngine";
import { abilityGrants } from "../gameEngine";
import { canExecuteAbilityGrant, executeAbilityGrant } from "../abilities/executor";
import { enemiesOf, pausedOf, pendingSkillChoiceOf, pendingSkillTargetOf, pendingTriggerInterruptOf } from "../state/access";
import { gameOf } from "../../engine/state";
import { matchesDamageOverTimeStatus } from "../rules/damageOverTime";
import { log } from "./utils";

/** Manual activation of a group artifact in a combat decision window. */
export const artifactHandler: GameHandler = {
  id: "artifact-activation",
  phases: ["HERO_ACTION", "BOSS_COMBAT"],
  actions: ["USE_ARTIFACT"],
  legalActions: () => [],
  apply(state, action, engine) {
    if (action.type !== "USE_ARTIFACT") return state;
    if (pausedOf(state) || pendingSkillChoiceOf(state) || pendingSkillTargetOf(state) || pendingTriggerInterruptOf(state))
      return log(state, "[AVISO] Conclua a escolha pendente primeiro.");
    if (!gameOf(state).combat ||
      !["selecting_hero", "selecting_target"].includes(gameOf(state).combat?.phase ?? ""))
      return log(state, "[AVISO] Ative o artefato durante uma janela de ação do combate.");
    const artifact = gameOf(state).groupArtifacts.find((entry) => entry.cardId === action.payload.artifactId);
    if (!artifact) return log(state, "[AVISO] Artefato não pertence ao grupo.");
    const enemy = enemiesOf(state).find((unit) =>
      unit.id === action.payload.targetEnemyId && unit.status === "active");
    if (!enemy || !enemy.conditions.some((condition) =>
      matchesDamageOverTimeStatus(condition, "poison") || condition.startsWith("poison:")))
      return log(state, "[AVISO] Escolha um inimigo vivo com pelo menos um stack de Veneno.");
    const grant = abilityGrants(engine, artifact.cardId).find((entry) =>
      entry.activation.kind === "manual" &&
      entry.abilityId === "witch_artifact_corrupted_heart_burst");
    if (!grant) return log(state, "[AVISO] Habilidade do artefato indisponível.");
    const source = {
      kind: "artifact" as const,
      cardId: artifact.cardId,
      ...(artifact.carriedBy ? { sourceHeroId: artifact.carriedBy } : {}),
    };
    const targetIds = [enemy.id];
    const unavailable = canExecuteAbilityGrant(engine, state, source, grant, "manual", undefined, targetIds);
    if (unavailable) return log(state, "[AVISO] " + unavailable);
    return executeAbilityGrant(engine, state, {
      source, grant, triggeredBy: "manual", targetIds,
    });
  },
};

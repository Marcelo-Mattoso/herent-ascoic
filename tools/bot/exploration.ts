/** Ordenação adversarial do Explorer: premia diversidade sem inventar ações.
 * Compartilhada entre o jogador Explorer e a execução aprofundada de bugs.
 */
import type { Action } from "@/core/actions/types";

export function actionIdentity(action: Action): string {
  switch (action.type) {
    case "USE_SKILL": return action.type + ":" + action.payload.skillId;
    case "USE_ITEM":
    case "USE_REWARD_ITEM": return action.type + ":" + action.payload.itemId;
    case "USE_ARTIFACT": return action.type + ":" + action.payload.artifactId;
    case "SKILL_CHOICE": return action.type + ":" + action.payload.skillId + ":" + action.payload.choice;
    default: return action.type;
  }
}

export function adversarialScoredMoves<T extends { readonly action: Action; readonly score: number }>(
  moves: readonly T[],
  usage: ReadonlyMap<string, number>,
  random: () => number,
): T[] {
  return moves.map((move, index) => {
    const identity = actionIdentity(move.action);
    const novelty = 1 / (1 + (usage.get(identity) ?? 0));
    const unusual = ["USE_SKILL", "USE_ITEM", "USE_REWARD_ITEM", "USE_POWER",
      "APPLY_TRIGGER_INTERRUPT", "SKIP_TRIGGER_INTERRUPT", "SKILL_CHOICE",
      "SELECT_SKILL_TARGET", "SELECT_DIE"].includes(move.action.type);
    return { move, index, priority: random() * 3 + novelty * 4 +
      (unusual ? 2 : 0) - Math.max(-1, Math.min(1, move.score / 500)) };
  }).sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map(({ move }) => move);
}

/** Mantido para testes e consumidores do antigo Caçador de Bugs. */
export function adversarialOrder(
  moves: readonly { readonly action: Action; readonly score: number }[],
  usage: ReadonlyMap<string, number>,
  random: () => number,
): Action[] {
  return adversarialScoredMoves(moves, usage, random).map(move => move.action);
}

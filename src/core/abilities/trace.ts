/** Proveniência de habilidades no estado real; observação, nunca regra de jogo. */
import { gameOf, withGame } from "../../engine/state";
import { enemiesOf, heroesOf } from "../state/access";
import type { GameState } from "../state/gameState";
import type { EffectNode } from "../skills/dsl/types";

export interface AbilityExecutionEvidence {
  readonly sequence: number;
  readonly abilityId: string;
  readonly grantId: string;
  readonly sourceCardId: string;
  readonly sourceEntityId?: string;
  readonly trigger: string;
  readonly targets: readonly string[];
  readonly declaredKinds: readonly string[];
  readonly outcome: "executed" | "pending_choice" | "inline";
  /** Apenas variação de PV mensurável no instante; zero NÃO significa falha. */
  readonly hpDelta: Readonly<Record<string, number>>;
}

export function effectKinds(nodes: readonly EffectNode[] | undefined): string[] {
  const result: string[] = [];
  const visit = (list: readonly EffectNode[]): void => {
    for (const node of list) {
      result.push(node.kind);
      if (node.kind === "i_if") {
        visit(node.then);
        if (node.else) visit(node.else);
      } else if (node.kind === "i_for_each") visit(node.do);
      else if (node.kind === "i_choose_one") for (const option of node.options) visit(option.effect);
      else if (node.kind === "add_trigger") visit(node.effect);
    }
  };
  visit(nodes ?? []);
  return result;
}

export function recordAbilityExecution(
  before: GameState,
  after: GameState,
  value: Omit<AbilityExecutionEvidence, "sequence" | "hpDelta">,
): GameState {
  const previous = gameOf(after).abilityTrace ?? [];
  const hpBefore = new Map([...heroesOf(before), ...enemiesOf(before)].map(u => [u.id, u.currentLife]));
  const hpDelta: Record<string, number> = {};
  for (const unit of [...heroesOf(after), ...enemiesOf(after)]) {
    const start = hpBefore.get(unit.id);
    if (start !== undefined && start !== unit.currentLife) hpDelta[unit.id] = unit.currentLife - start;
  }
  const evidence: AbilityExecutionEvidence = {
    ...value,
    sequence: (previous[previous.length - 1]?.sequence ?? 0) + 1,
    hpDelta,
  };
  // Mantém memória limitada mesmo em auditorias de milhares de partidas.
  return withGame(after, game => ({ ...game, abilityTrace: [...previous.slice(-511), evidence] }));
}

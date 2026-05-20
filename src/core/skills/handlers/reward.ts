// reward: impede que a criatura-fonte conceda recompensas ao ser derrotada.
// Marca enemy.noReward = true. Verificado em handleGrantRewards (reducer/reward.ts).
// Cobre: habilidade-fuga-covarde (Goblin das Cavernas Escuras).

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log, mapEnemy } from "../../reducer/utils";

export function handleReward(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!ctx.sourceEnemyId) return state;
	return log(
		mapEnemy(state, ctx.sourceEnemyId, (e) => ({ ...e, noReward: true })),
		`${ctx.sourceEnemyId}: Fuga Covarde — sem recompensas ao ser derrotado.`,
	);
}

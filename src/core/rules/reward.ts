// Cálculo de recompensas ao fim de uma sala (manual seção 9).
// Criaturas fugidas ou removidas não concedem recompensa.

import type { EnemyState } from "../state/enemyState";
import type { RoomState } from "../state/roomState";

export interface RewardSummary {
	readonly xp: number;
	readonly items: number;
	readonly artifacts: number;
}

export function calculateRewards(
	room: RoomState,
	defeatedEnemies: readonly EnemyState[],
): RewardSummary {
	// Apenas criaturas com status "defeated" concedem recompensa
	const eligible = defeatedEnemies.filter((e) => e.status === "defeated");

	let xp = room.xp;
	let items = room.rewardType === "item" ? room.reward : 0;
	let artifacts = room.rewardType === "artifact" ? room.reward : 0;

	for (const enemy of eligible) {
		// EnemyState não carrega xp/reward diretamente — o reducer deve passá-los
		// resolvidos a partir do catálogo. Aqui somamos o que vier no estado.
		const tokens = enemy.tokens;
		xp += (tokens.xp as number | undefined) ?? 0;
		items += (tokens.reward_item as number | undefined) ?? 0;
		artifacts += (tokens.reward_artifact as number | undefined) ?? 0;
	}

	return { xp, items, artifacts };
}

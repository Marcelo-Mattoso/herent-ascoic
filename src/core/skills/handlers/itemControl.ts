// itemControl: Evasão das Fendas (Morcego do Teto Negro, Crânio Flamejante).
// Ignora o primeiro efeito de item usado contra esta criatura por combate.
// Trigger: first_item_effect_received. Verificado em handleUseItem (combat.ts).

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleItemControl(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	const enemyId = ctx.sourceEnemyId;
	if (!enemyId || !state.combat) return state;

	// Usa oncePer.combat para garantir que só bloqueia uma vez por combate
	const key = `itemControl::${enemyId}`;
	if (state.combat.oncePer.combat[key]) return state;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				itemControlByEnemy: { ...state.combat.itemControlByEnemy, [enemyId]: true },
				oncePer: {
					...state.combat.oncePer,
					combat: { ...state.combat.oncePer.combat, [key]: true },
				},
			},
		},
		`${enemyId}: Evasão das Fendas ativa — próximo item bloqueado.`,
	);
}

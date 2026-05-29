// discardDungeon_prevention: Caminho Preservado (Ladino skill).
// Uma vez por sala, quando uma carta de dungeon seria descartada por efeito,
// devolve essa carta ao topo do deck da dungeon.
// A prevenção é verificada no momento do descarte — handler aqui apenas registra
// o estado "pronto para prevenir" (guardado via oncePer no dispatch).

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";

export function handleDiscardDungeonPrevention(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId) return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;
	if (state.flags?.discardDungeonLocked) {
		return log(
			state,
			`${hero.cardName}: Caminho Preservado bloqueado pela Corrupção de Caminho.`,
		);
	}
	return log(
		state,
		`${hero.cardName}: Caminho Preservado — próximo descarte de dungeon cancelado.`,
	);
}

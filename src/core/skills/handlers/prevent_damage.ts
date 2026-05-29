// prevent_damage: Antídoto e itens de proteção.
// Impede todo o dano de um golpe específico.
// Registrado como modificador passivo verificado no on_damage_taken.

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";

export function handlePreventDamage(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId || !state.combat) return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;
	return log(state, `${hero.cardName}: dano prevenido por efeito de proteção.`);
}

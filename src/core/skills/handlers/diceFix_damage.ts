// diceFix_damage: Execução do Caçador (Caçador power).
// Uma vez por jogo, depois de rolar contra sua Presa: transforma 1 dado azul em 6 e +1 de dano se acertar.
// value = "6/1".
// Por ser interativo (jogador ativa após ver a rolagem), o handler apenas loga e registra disponibilidade.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log } from "../../reducer/utils";

export function handleDiceFixDamage(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId || !state.combat) return state;
	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero) return state;

	// Verificar se o alvo atual é a presa
	const isPrey =
		state.combat.prey &&
		(ctx.sourceEnemyId === state.combat.prey ||
			state.combat.pairs.some(
				(p) => p.heroId === hero.id && p.enemyId === state.combat!.prey,
			));

	if (!isPrey) return state;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				bonusNextAttack: {
					...state.combat.bonusNextAttack,
					[hero.id]: (state.combat.bonusNextAttack?.[hero.id] ?? 0) + 1,
				},
			},
		},
		`Caçador: Execução — +1 dado azul → 6, +1 dano contra Presa.`,
	);
}

// targetProtection: Véu Protetor (Manto do Véu Partido, Alaúde).
// Uma vez por sala, ignora o primeiro efeito que escolheria este herói como alvo.
// Trigger: once_per_room_on_targeted_by_effect → on_targeted.
// Flag verificada por handlers de dano direto ao herói.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { log, mapEnemy } from "../../reducer/utils";

export function handleTargetProtection(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	const heroId = ctx.sourceHeroId;
	if (!heroId || !state.combat) return state;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				targetProtectionByHero: { ...state.combat.targetProtectionByHero, [heroId]: true },
			},
		},
		`${heroId}: Véu Protetor ativo — próximo efeito que escolha este herói ignorado.`,
	);
}

// Utilitário: verifica e consome proteção de alvo. Retorna [blocked, newState].
export function consumeTargetProtection(
	state: GameState,
	heroId: string,
): [boolean, GameState] {
	if (!state.combat?.targetProtectionByHero[heroId]) return [false, state];
	const next: GameState = {
		...state,
		combat: {
			...state.combat,
			targetProtectionByHero: { ...state.combat.targetProtectionByHero, [heroId]: false },
		},
	};
	return [true, log(next, `${heroId}: Véu Protetor consumido.`)];
}

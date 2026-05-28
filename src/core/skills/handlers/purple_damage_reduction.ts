// Resguardo da Última Luz: reduz dano recebido de efeitos roxos enquanto ativo.
// Trigger: on_purple_effect_damage_taken.
// Quando o trigger disparar (via efeito roxo que causa dano), este handler reduz o dano.
// Implementado como flag em state.flags para ser consultado pelo handler que causa dano roxo.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handlePurpleDamageReduction(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId) return state;
	const reduction = parseNumber(value) ?? 1;
	// Armazena a redução ativa para o herói via flags para consulta posterior
	const key = `purpleDmgReduction::${ctx.sourceHeroId}`;
	const current = Number(state.flags[key] ?? 0);
	return log(
		{ ...state, flags: { ...state.flags, [key]: (current + reduction) as unknown as boolean } },
		`Resguardo da Última Luz: ${ctx.sourceHeroId} reduz ${reduction} de dano roxo.`,
	);
}

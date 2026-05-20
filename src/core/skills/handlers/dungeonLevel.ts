// dungeonLevel: Despertar da Fornalha, Despertar Sombrio (efeito roxo).
// Aumenta o Despertar da Masmorra em `value` níveis.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";
import type { ColorIndex } from "../../state/color";

const MAX_LEVEL: ColorIndex = 4;

export function handleDungeonLevel(
	state: GameState,
	_ctx: SkillContext,
	value: number | string | null,
): GameState {
	const amount = parseNumber(value) ?? 1;
	const newLevel = Math.min(MAX_LEVEL, (state.despertar + amount) as ColorIndex);
	return log(
		{ ...state, despertar: newLevel as ColorIndex },
		`Despertar da Masmorra avançou para nível ${newLevel}.`,
	);
}

// discardDungeon: descarta N cartas do deck de dungeon ao destruir a criatura-fonte.
// Trigger: on_destroyed.
// Cobre: efeito_roxo_monstro-cinzas-da-ruina, habilidade-chao-em-ruina.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { discardFromDungeonDeck, log } from "../../reducer/exploration";

export function handleDiscardDungeon(
	state: GameState,
	_ctx: SkillContext,
	value: number | string | null,
): GameState {
	const n = parseNumber(value) ?? 1;
	const next = discardFromDungeonDeck(state, n);
	return log(next, `${n} carta(s) de dungeon descartada(s) por habilidade.`);
}

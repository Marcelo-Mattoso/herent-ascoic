// dungeon: Iluminar o Caminho (Tocha de Breu).
// Ao revelar caminhos, mostra as cartas do topo do deck de dungeon via SKILL_CHOICE.
// A continuação é informacional — o jogador confirma e o jogo prossegue.
// Trigger: on_reveal_paths.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";
import { registerContinuation } from "../registry";

export function handleDungeon(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const n = parseNumber(value) ?? 1;
	const topCards = state.decks.dungeonDeck.available.slice(0, n);

	if (topCards.length === 0) {
		return log(state, "Iluminar o Caminho: deck de dungeon vazio.");
	}

	const options = topCards.map((cardName, i) => ({
		id: `keep_${i}`,
		label: cardName as string,
	}));
	options.push({ id: "ok", label: "Confirmar (manter ordem atual)" });

	return {
		...state,
		pendingSkillChoice: {
			skillId: ctx.skillId ?? "habilidade-iluminar-o-caminho",
			prompt: `Iluminar o Caminho: próxima(s) ${topCards.length} carta(s) do deck de dungeon.`,
			options,
			sourceHeroId: ctx.sourceHeroId,
		},
	};
}

// Continuação: informacional, sem mudança de estado (jogador já viu as cartas).
registerContinuation("dungeon", (state, _ctx, _choice) => {
	return log(state, "Iluminar o Caminho: informação confirmada.");
});

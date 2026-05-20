// recoverDungeon: Rito de Retorno (Necromante skill) e Caminho Restaurado (Ladino power).
// Uma vez por sala: paga 3 de vida (Necromante) e recupera `value` carta do descarte,
// embaralhando no deck. O Ladino power não tem custo.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log, mapHero } from "../../reducer/utils";
import { shuffle } from "../../reducer/utils";

export function handleRecoverDungeon(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const count = parseNumber(value) ?? 1;
	const { discarded } = state.decks.dungeonDeck;
	if (discarded.length === 0) return log(state, "Descarte da dungeon vazio — nada para recuperar.");

	const toRecover = discarded.slice(0, count);
	const remaining = discarded.slice(count);

	const reshuffled = shuffle([...state.decks.dungeonDeck.available, ...toRecover]);

	let next: GameState = {
		...state,
		decks: {
			...state.decks,
			dungeonDeck: {
				...state.decks.dungeonDeck,
				available: reshuffled,
				discarded: remaining,
			},
		},
	};

	// Necromante skill: custa 3 de vida
	if (ctx.sourceHeroId) {
		const hero = next.heroes.find((h) => h.id === ctx.sourceHeroId);
		const isNecromante = hero?.cardName === "Necromante do Véu Profundo";
		if (isNecromante) {
			next = mapHero(next, ctx.sourceHeroId, (h) => ({
				...h,
				currentLife: Math.max(1, h.currentLife - 3),
			}));
		}
	}

	return log(next, `${count} carta(s) de dungeon recuperada(s) do descarte.`);
}

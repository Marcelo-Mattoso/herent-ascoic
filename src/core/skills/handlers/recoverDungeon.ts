// recoverDungeon: Rito de Retorno (Necromante skill) e Caminho Restaurado (Ladino power).
// Uma vez por sala: paga 3 de vida (Necromante) e recupera `value` carta do descarte,
// embaralhando no deck. O Ladino power não tem custo.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log, mapHero, shuffleRng } from "../../reducer/utils";

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

	const { value: reshuffled, next: rng } = shuffleRng([...state.decks.dungeonDeck.available, ...toRecover], state.rng);

	let next: GameState = {
		...state,
		rng,
		decks: {
			...state.decks,
			dungeonDeck: {
				...state.decks.dungeonDeck,
				available: reshuffled,
				discarded: remaining,
			},
		},
	};

	// Custo de vida: a skill do Necromante tem trigger "once_per_room" com custo de 3 de vida.
	// O custo é cobrado quando o field é "skill" (habilidade ativa), não "power".
	// Para distinguir: se a source é um herói e o skillId pertence à categoria "habilidade",
	// cobramos o custo definido implicitamente na spec (3 de vida).
	if (ctx.sourceHeroId && ctx.skillId === "habilidade-rito-de-retorno") {
		next = mapHero(next, ctx.sourceHeroId, (h) => ({
			...h,
			currentLife: Math.max(1, h.currentLife - 3),
		}));
	}

	return log(next, `${count} carta(s) de dungeon recuperada(s) do descarte.`);
}

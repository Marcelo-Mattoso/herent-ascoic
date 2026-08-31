// Lógica de progressão: subir nível (Ímpeto), mudar Despertar da Masmorra.
// Usada pelos handlers de SPEND_XP.

import { getCardName } from "../data/cardLocale";
import { getCardById, getSubbossRooms } from "../data/cards";
import { nextColor, previousColor, valueAtColor } from "../rules/colorScale";
import type { ColorIndex } from "../state/color";
import type { GameState } from "../state/gameState";
import { applyLifeGain } from "../systems/healSystem";
import { log, mapHero, shuffleRng } from "./utils";

// Sobe o Ímpeto de um herói e atualiza seus stats. Também avança o Despertar.
export function levelUpHero(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;

	const newImpeto = nextColor(hero.impeto);
	if (newImpeto === hero.impeto) {
		return log(state, `${getCardName(hero.cardId)} já está no nível máximo.`);
	}

	const card = getCardById(hero.cardId);
	if (!card || card.type !== "hero") return state;

	const ci = newImpeto as ColorIndex;
	const newMaxLife = valueAtColor(card.life, ci);
	const lifeGain = newMaxLife - card.life[hero.impeto];

	let next = mapHero(state, heroId, (h) => ({
		...h,
		impeto: newImpeto,
		maxLife: newMaxLife,
		hitBonus: valueAtColor(card.hitBonus, ci),
		dice: card.diceByColor[ci],
	}));
	next = applyLifeGain(next, heroId, lifeGain);

	// Subir nível também avança o Despertar
	next = { ...next, despertar: nextColor(next.despertar) };

	// Ao atingir Vermelho (3), injetar salas de subchefe no deck de dungeon
	if (next.despertar === 3 && next.subbosses.available.length === 0) {
		next = injectSubbossRooms(next);
	}

	return log(
		next,
		`${getCardName(hero.cardId)} subiu para nível ${newImpeto}. Despertar avança.`,
	);
}

// Embaralha as 2 salas de subchefe no deck de dungeon remanescente.
function injectSubbossRooms(state: GameState): GameState {
	const subbossRoomIds = getSubbossRooms().map((r) => r.id);
	if (subbossRoomIds.length === 0) return state;

	const { available, discarded, removed } = state.decks.dungeonDeck;
	const { value: combined, next: rng } = shuffleRng(
		[...available, ...subbossRoomIds],
		state.rng,
	);
	const subbossRoomNames = getSubbossRooms().map((r) => getCardName(r.id));
	return log(
		{
			...state,
			rng,
			subbosses: {
				available: subbossRoomIds,
				defeated: state.subbosses.defeated,
			},
			decks: {
				...state.decks,
				dungeonDeck: { available: combined, discarded, removed },
			},
		},
		`Despertar Vermelho! Salas de subchefe injetadas no deck (${subbossRoomNames.join(", ")}).`,
	);
}

export function lowerDespertar(state: GameState): GameState {
	const newDespertar = previousColor(state.despertar);
	return log(
		{ ...state, despertar: newDespertar },
		`Despertar reduzido para nível ${newDespertar}.`,
	);
}

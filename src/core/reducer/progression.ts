// Lógica de progressão: subir nível (Ímpeto), mudar Despertar da Masmorra.
// Usada pelos handlers de SPEND_XP.

import { getCardByName } from "../../data/cards";
import { nextColor, previousColor, valueAtColor } from "../rules/colorScale";
import type { ColorIndex } from "../state/color";
import type { GameState } from "../state/gameState";
import { log, mapHero } from "./utils";

// Sobe o Ímpeto de um herói e atualiza seus stats. Também avança o Despertar.
export function levelUpHero(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;

	const newImpeto = nextColor(hero.impeto);
	if (newImpeto === hero.impeto) {
		return log(state, `${hero.cardName} já está no nível máximo.`);
	}

	const card = getCardByName(hero.cardName);
	if (!card || card.type !== "hero") return state;

	const ci = newImpeto as ColorIndex;
	const newMaxLife = valueAtColor(card.life, ci);
	const lifeGain = newMaxLife - card.life[hero.impeto];

	let next = mapHero(state, heroId, (h) => ({
		...h,
		impeto: newImpeto,
		maxLife: newMaxLife,
		currentLife: Math.min(h.currentLife + lifeGain, newMaxLife),
		hitBonus: valueAtColor(card.hitBonus, ci),
		dice: card.diceByColor[ci],
	}));

	// Subir nível também avança o Despertar
	next = { ...next, despertar: nextColor(next.despertar) };
	return log(
		next,
		`${hero.cardName} subiu para nível ${newImpeto}. Despertar avança.`,
	);
}

export function lowerDespertar(state: GameState): GameState {
	const newDespertar = previousColor(state.despertar);
	return log(
		{ ...state, despertar: newDespertar },
		`Despertar reduzido para nível ${newDespertar}.`,
	);
}

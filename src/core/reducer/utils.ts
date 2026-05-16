// Utilitários internos do reducer: shuffle, fábricas de HeroState/EnemyState, log.
// Não exportar para fora do módulo reducer.

import type { CreatureCard, HeroCard, SubbossCard } from "../../data/cardTypes";
import type { ColorIndex } from "../state/color";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

export function shuffle<T>(arr: readonly T[], rng = Math.random): T[] {
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
	}
	return copy;
}

export function createHeroFromCard(
	card: HeroCard,
	colorIndex: ColorIndex,
): HeroState {
	return {
		id: crypto.randomUUID(),
		cardName: card.name,
		maxLife: card.life[colorIndex],
		currentLife: card.life[colorIndex],
		damage: card.damage,
		hitBonus: card.hitBonus[colorIndex],
		dice: card.diceByColor[colorIndex],
		impeto: colorIndex,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
	};
}

export function createEnemyFromCard(
	card: CreatureCard | SubbossCard,
	despertar: ColorIndex,
): EnemyState {
	return {
		id: crypto.randomUUID(),
		cardName: card.name,
		maxLife: card.life[despertar],
		currentLife: card.life[despertar],
		damage: card.damage,
		hitBonus: card.hitBonus[despertar],
		dice: card.diceByColor[despertar],
		tokens: {
			xp: card.xp,
			reward_item: card.rewardType === "item" ? card.reward : 0,
			reward_artifact: card.rewardType === "artifact" ? card.reward : 0,
		},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};
}

export function log(state: GameState, message: string): GameState {
	return { ...state, eventLog: [...state.eventLog, message] };
}

export function getActiveHero(state: GameState): HeroState | undefined {
	return state.heroes.find((h) => h.status === "active");
}

export function mapHero(
	state: GameState,
	heroId: string,
	fn: (h: HeroState) => HeroState,
): GameState {
	return {
		...state,
		heroes: state.heroes.map((h) => (h.id === heroId ? fn(h) : h)),
	};
}

export function mapEnemy(
	state: GameState,
	enemyId: string,
	fn: (e: EnemyState) => EnemyState,
): GameState {
	return {
		...state,
		activeEnemies: state.activeEnemies.map((e) =>
			e.id === enemyId ? fn(e) : e,
		),
	};
}

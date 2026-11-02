import type { CreatureCard, HeroCard, SubbossCard } from "../data/cardTypes";
import type { RngState } from "../ports/random";
import { nextFloat, nextId } from "../ports/random";
import type { ColorIndex } from "../state/color";
import type { EnemyRecord, EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroRecord, HeroState } from "../state/heroState";
import { gameOf, withGame } from "../../engine/state";

// Helper de threading: extrai RNG do state, executa fn, devolve state com RNG avançado.
export function withRng<T>(
	state: GameState,
	fn: (rng: RngState) => { value: T; next: RngState },
): { state: GameState; value: T } {
	const { value, next } = fn(gameOf(state).rng);
	return { state: withGame(state, (prevGame) => ({ ...prevGame, rng: next })), value };
}

// Fisher-Yates determinístico usando RngState.
export function shuffleRng<T>(
	arr: readonly T[],
	rng: RngState,
): { value: T[]; next: RngState } {
	const copy = [...arr];
	let currentRng = rng;
	for (let i = copy.length - 1; i > 0; i--) {
		const { value: f, next } = nextFloat(currentRng);
		const j = Math.floor(f * (i + 1));
		currentRng = next;
		[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
	}
	return { value: copy, next: currentRng };
}

export function createHeroFromCard(
	card: HeroCard,
	colorIndex: ColorIndex,
	rng: RngState,
	playerIndex = 0,
): { hero: HeroState; next: RngState } {
	const { value: id, next } = nextId(rng, "h");
	const hero: HeroState = {
		id,
		cardId: card.id,
		maxLife: card.life[colorIndex],
		currentLife: card.life[colorIndex],
		damage: card.damage,
		hitBonus: card.hitBonus[colorIndex],
		dice: card.diceByColor[colorIndex],
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex,
		xp: 0,
	};
	return { hero, next };
}

export function createEnemyFromCard(
	card: CreatureCard | SubbossCard,
	despertar: ColorIndex,
	rng: RngState,
): { enemy: EnemyState; next: RngState } {
	const { value: id, next } = nextId(rng, "e");
	const enemy: EnemyState = {
		id,
		cardId: card.id,
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
		isSubboss: card.type === "subboss",
	};
	return { enemy, next };
}

export function log(state: GameState, message: string): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, eventLog: [...gameOf(state).eventLog, message] }));
}

export function getActiveHero(state: GameState): HeroRecord | undefined {
	return gameOf(state).heroes.find((h) => h.status === "active");
}

export function mapHero(
	state: GameState,
	heroId: string,
	fn: (h: HeroRecord) => HeroRecord,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, heroes: gameOf(state).heroes.map((h) => (h.id === heroId ? fn(h) : h)) }));
}

export function mapEnemy(
	state: GameState,
	enemyId: string,
	fn: (e: EnemyRecord) => EnemyRecord,
): GameState {
	return withGame(state, (prevGame) => ({ ...prevGame, activeEnemies: gameOf(state).activeEnemies.map((e) =>
			e.id === enemyId ? fn(e) : e,
		) }));
}

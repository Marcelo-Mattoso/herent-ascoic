import { describe, expect, it } from "vitest";
import { testEngine } from "../__tests__/testEngine";
import { getDungeonRecoveryCost } from "../config/defaults";
import { getCreatures, getSubbosses } from "../data/cards";
import { getExpansionCardMetadata } from "../data/expansions";
import { awakeningOf, decksOf, heroesOf, impetoOf, withAwakening, withDecks } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
import { createInitialGameState } from "../state/gameState";
import type { GameState, Difficulty } from "../state/gameState";
import { handleDungeonExhaustedSpend } from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { reducer } from "./index";

const HEROES = ["hero_eternal_rest_cleric", "hero_broken_bastion_warrior", "hero_crimson_barbarian", "hero_rift_rogue"];

function begin(difficulty: Difficulty, count = 2): GameState {
	return reducer(testEngine, createInitialGameState({ heroCardIds: HEROES.slice(0, count) }), {
		type: "START_GAME",
		payload: { heroCardIds: HEROES.slice(0, count), difficulty, seed: 11, deferInitialRoomReveal: true },
	});
}

describe("balanceamento do Despertar", () => {
	it("mantém dados e vidas por carta; suaviza a curva de acerto das criaturas", () => {
		const base = [1, 3, 5, 6, 8];
		for (const card of [...getCreatures(), ...getSubbosses()].filter(
			(entry) => getExpansionCardMetadata(entry.id)?.expansionId === "fornalha-sombria",
		)) {
			const offset = card.hitBonus[0] - 1;
			expect(card.hitBonus).toEqual(base.map((n) => n + offset));
			expect(card.life).toHaveLength(5);
			expect(card.diceByColor).toHaveLength(5);
		}
	});
	it("espera TODOS os heróis e só então avança o Despertar uma vez", () => {
		let state = begin("normal");
		const first = heroesOf(state)[0]!.id;
		const second = heroesOf(state)[1]!.id;
		state = levelUpHero(testEngine, state, first);
		expect(awakeningOf(state)).toBe(0);
		state = levelUpHero(testEngine, state, first);
		expect(awakeningOf(state)).toBe(0);
		state = levelUpHero(testEngine, state, second);
		expect(awakeningOf(state)).toBe(1);
		expect(gameOf(state).groupImpetoMilestone).toBe(1);
		state = levelUpHero(testEngine, state, second);
		expect(awakeningOf(state)).toBe(2);
		expect(gameOf(state).groupImpetoMilestone).toBe(2);
	});
	it("inicia grupo laranja no Muito Fácil e aguarda todos chegarem ao vermelho", () => {
		let state = begin("very_easy");
		expect(heroesOf(state).map((hero) => impetoOf(state, hero.id))).toEqual([2, 2]);
		expect(awakeningOf(state)).toBe(0);
		expect(gameOf(state).groupImpetoMilestone).toBe(2);
		state = levelUpHero(testEngine, state, heroesOf(state)[0]!.id);
		expect(awakeningOf(state)).toBe(0);
		state = levelUpHero(testEngine, state, heroesOf(state)[1]!.id);
		expect(awakeningOf(state)).toBe(1);
	});
	it("não reinicia o gatilho após redução por XP; preserva outros aumentos", () => {
		let state = begin("normal");
		state = levelUpHero(testEngine, state, heroesOf(state)[0]!.id);
		state = levelUpHero(testEngine, state, heroesOf(state)[1]!.id);
		expect(awakeningOf(state)).toBe(1);
		state = lowerDespertar(testEngine, state);
		expect(awakeningOf(state)).toBe(0);
		state = withAwakening(state, 1); // outro efeito elevou o Despertar
		state = levelUpHero(testEngine, state, heroesOf(state)[0]!.id);
		expect(awakeningOf(state)).toBe(1);
		state = levelUpHero(testEngine, state, heroesOf(state)[1]!.id);
		expect(awakeningOf(state)).toBe(2);
	});
	it("com quatro heróis só avança quando o último alcança o patamar", () => {
		let state = begin("normal", 4);
		for (let i = 0; i < 3; i++) {
			state = levelUpHero(testEngine, state, heroesOf(state)[i]!.id);
			expect(awakeningOf(state)).toBe(0);
		}
		state = levelUpHero(testEngine, state, heroesOf(state)[3]!.id);
		expect(awakeningOf(state)).toBe(1);
	});
	it("aplica custo 3/4/5/6/7 de recuperação e não aceita XP insuficiente", () => {
		const cases: Array<[Difficulty, number, number, number]> = [
			["very_easy", 3, 2, 0], ["easy", 4, 1, 0], ["normal", 5, 0, 0],
			["hard", 6, 0, 1], ["nightmare", 7, 0, 1],
		];
		for (const [difficulty, cost, heroOffset, dungeonOffset] of cases) {
			const started = begin(difficulty);
			expect(getDungeonRecoveryCost(difficulty)).toBe(cost);
			expect(impetoOf(started, heroesOf(started)[0]!.id)).toBe(heroOffset);
			expect(awakeningOf(started)).toBe(dungeonOffset);
			const decks = decksOf(started);
			const exhausted: GameState = withDecks(
				withGame(started, (game) => ({ ...game, status: "DUNGEON_EXHAUSTED", groupXp: cost })),
				{ ...decks, dungeonDeck: { available: [], discarded: ["room_narrow_corridor", "room_dungeon_room"], removed: [] } },
			);
			const poor = withGame(exhausted, (game) => ({ ...game, groupXp: cost - 1 }));
			expect(handleDungeonExhaustedSpend(testEngine, poor)).toEqual(poor);
			const recovered = handleDungeonExhaustedSpend(testEngine, exhausted);
			expect(gameOf(recovered).groupXp).toBe(0);
			expect(gameOf(recovered).currentRoom).not.toBeNull();
		}
	});
});

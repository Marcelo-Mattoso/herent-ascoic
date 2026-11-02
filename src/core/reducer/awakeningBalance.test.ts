import { describe, expect, it } from "vitest";
import { getDungeonRecoveryCost } from "../config/defaults";
import { getCreatures, getSubbosses } from "../data/cards";
import { createInitialGameState } from "../state/gameState";
import type { GameState, Difficulty } from "../state/gameState";
import { handleDungeonExhaustedSpend } from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { reducer } from "./index";

const HEROES = ["hero_eternal_rest_cleric", "hero_broken_bastion_warrior", "hero_crimson_barbarian", "hero_rift_rogue"];

function begin(difficulty: Difficulty, count = 2): GameState {
	return reducer(createInitialGameState({ heroCardIds: HEROES.slice(0, count) }), {
		type: "START_GAME",
		payload: { heroCardIds: HEROES.slice(0, count), difficulty, seed: 11, deferInitialRoomReveal: true },
	});
}

describe("balanceamento do Despertar", () => {
	it("mantém dados e vidas por carta; suaviza a curva de acerto das criaturas", () => {
		const base = [1, 3, 5, 6, 8];
		for (const card of [...getCreatures(), ...getSubbosses()]) {
			const offset = card.hitBonus[0] - 1;
			expect(card.hitBonus).toEqual(base.map((n) => n + offset));
			expect(card.life).toHaveLength(5);
			expect(card.diceByColor).toHaveLength(5);
		}
	});
	it("espera TODOS os heróis e só então avança o Despertar uma vez", () => {
		let state = begin("normal");
		const first = state.heroes[0]!.id;
		const second = state.heroes[1]!.id;
		state = levelUpHero(state, first);
		expect(state.despertar).toBe(0);
		state = levelUpHero(state, first);
		expect(state.despertar).toBe(0);
		state = levelUpHero(state, second);
		expect(state.despertar).toBe(1);
		expect(state.groupImpetoMilestone).toBe(1);
		state = levelUpHero(state, second);
		expect(state.despertar).toBe(2);
		expect(state.groupImpetoMilestone).toBe(2);
	});
	it("inicia grupo laranja no Muito Fácil e aguarda todos chegarem ao vermelho", () => {
		let state = begin("very_easy");
		expect(state.heroes.map((hero) => hero.impeto)).toEqual([2, 2]);
		expect(state.despertar).toBe(0);
		expect(state.groupImpetoMilestone).toBe(2);
		state = levelUpHero(state, state.heroes[0]!.id);
		expect(state.despertar).toBe(0);
		state = levelUpHero(state, state.heroes[1]!.id);
		expect(state.despertar).toBe(1);
	});
	it("não reinicia o gatilho após redução por XP; preserva outros aumentos", () => {
		let state = begin("normal");
		state = levelUpHero(state, state.heroes[0]!.id);
		state = levelUpHero(state, state.heroes[1]!.id);
		expect(state.despertar).toBe(1);
		state = lowerDespertar(state);
		expect(state.despertar).toBe(0);
		state = { ...state, despertar: 1 }; // outro efeito elevou o Despertar
		state = levelUpHero(state, state.heroes[0]!.id);
		expect(state.despertar).toBe(1);
		state = levelUpHero(state, state.heroes[1]!.id);
		expect(state.despertar).toBe(2);
	});
	it("com quatro heróis só avança quando o último alcança o patamar", () => {
		let state = begin("normal", 4);
		for (let i = 0; i < 3; i++) {
			state = levelUpHero(state, state.heroes[i]!.id);
			expect(state.despertar).toBe(0);
		}
		state = levelUpHero(state, state.heroes[3]!.id);
		expect(state.despertar).toBe(1);
	});
	it("aplica custo 3/4/5/6/7 de recuperação e não aceita XP insuficiente", () => {
		const cases: Array<[Difficulty, number, number, number]> = [
			["very_easy", 3, 2, 0], ["easy", 4, 1, 0], ["normal", 5, 0, 0],
			["hard", 6, 0, 1], ["nightmare", 7, 0, 1],
		];
		for (const [difficulty, cost, heroOffset, dungeonOffset] of cases) {
			const started = begin(difficulty);
			expect(getDungeonRecoveryCost(difficulty)).toBe(cost);
			expect(started.heroes[0]?.impeto).toBe(heroOffset);
			expect(started.despertar).toBe(dungeonOffset);
			const exhausted: GameState = {
				...started, status: "DUNGEON_EXHAUSTED", groupXp: cost,
				decks: { ...started.decks, dungeonDeck: { available: [], discarded: ["room_narrow_corridor", "room_dungeon_room"], removed: [] } },
			};
			expect(handleDungeonExhaustedSpend({ ...exhausted, groupXp: cost - 1 })).toEqual({ ...exhausted, groupXp: cost - 1 });
			const recovered = handleDungeonExhaustedSpend(exhausted);
			expect(recovered.groupXp).toBe(0);
			expect(recovered.currentRoom).not.toBeNull();
		}
	});
});

// Testes de F13 — Subchefes.
// Verifica injeção de salas ao atingir Despertar 3 e revelação de sala de subchefe.

import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../state/gameState";
import { reducer } from "../index";
import "../../skills/handlers/index"; // popula registry

function makeState() {
	let state = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	state = reducer(state, {
		type: "START_GAME",
		payload: {
			heroCardIds: ["hero_crimson_barbarian"],
			difficulty: "very_easy",
		},
	});
	return state;
}

describe("F13 — Subchefes", () => {
	it("inicia com subbosses.available vazio", () => {
		const state = makeState();
		expect(state.subbosses.available).toHaveLength(0);
		expect(state.subbosses.defeated).toHaveLength(0);
	});

	it("ao subir Despertar para 3, injeta 2 salas de subchefe no deck", () => {
		let state = makeState();
		// very_easy: heroOffset=2, então herói já começa em impeto=2 e despertar=0
		// Forçar despertar para 2 para que level-up avance para 3
		const heroId = state.heroes[0]!.id;
		state = {
			...state,
			groupXp: 10, // custo de level_up
			despertar: 2 as import("../../state/color").ColorIndex,
		};
		const deckBefore = state.decks.dungeonDeck.available.length;

		state = reducer(state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});

		// Despertar agora é 3
		expect(state.despertar).toBe(3);
		// 2 salas de subchefe foram injetadas
		expect(state.subbosses.available).toHaveLength(2);
		expect(state.decks.dungeonDeck.available.length).toBe(deckBefore + 2);
		// Os IDs das salas estão no deck
		for (const id of state.subbosses.available) {
			expect(state.decks.dungeonDeck.available).toContain(id);
		}
	});

	it("não injeta salas novamente se já foram injetadas (idempotência)", () => {
		let state = makeState();
		const heroId = state.heroes[0]!.id;
		state = {
			...state,
			groupXp: 99,
			despertar: 2 as import("../../state/color").ColorIndex,
		};
		// Primeira injeção (despertar 2 → 3)
		state = reducer(state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});
		expect(state.despertar).toBe(3);
		const availableAfterFirst = [...state.subbosses.available];

		// Segundo level-up: despertar 3 → 4, subbosses.available.length > 0 → não reinjecta
		state = reducer(state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});
		expect(state.despertar).toBe(4);
		// subbosses.available não cresceu (pode ter diminuído se algum foi derrotado, mas aqui 0 derrotados)
		expect(state.subbosses.available.length).toBeLessThanOrEqual(
			availableAfterFirst.length,
		);
	});

	it("revelar sala de subchefe spawna o subchefe correto (sem desenhar do enemyDeck)", () => {
		let state = makeState();

		// Injetar salas de subchefe manualmente no topo do deck
		state = {
			...state,
			currentRoom: null,
			status: "REVEAL_ROOM",
			despertar: 3 as import("../../state/color").ColorIndex,
			subbosses: {
				available: [
					"subboss_room_jailer_chamber",
					"subboss_room_cracked_abyss_chamber",
				],
				defeated: [],
			},
			decks: {
				...state.decks,
				dungeonDeck: {
					...state.decks.dungeonDeck,
					available: ["subboss_room_jailer_chamber"],
				},
			},
		};
		const enemyDeckSizeBefore = state.decks.enemyDeck.available.length;

		state = reducer(state, { type: "REVEAL_ROOM" });

		// Deve ter ido direto para COMBAT_START
		expect(state.status).toBe("COMBAT_START");
		// Sala atual é a câmara
		expect(state.currentRoom?.cardId).toBe("subboss_room_jailer_chamber");
		// O subchefe foi spawniado como enemy ativo
		expect(state.activeEnemies).toHaveLength(1);
		expect(state.activeEnemies[0]!.cardId).toBe(
			"subboss_crimson_dungeon_jailer",
		);
		expect(state.activeEnemies[0]!.isSubboss).toBe(true);
		// Enemy deck não foi tocado
		expect(state.decks.enemyDeck.available.length).toBe(enemyDeckSizeBefore);
		// Herói foi selecionado inicialmente via START_GAME — não verificamos aqui
		// O deck de dungeon consumiu a carta
		expect(state.decks.dungeonDeck.available).not.toContain(
			"subboss_room_jailer_chamber",
		);
	});
});

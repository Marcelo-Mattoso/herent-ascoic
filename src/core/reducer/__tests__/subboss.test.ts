import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../state/gameState";
import { spawnEnemy } from "../../state/access";
import { reducer } from "../index";
import { lowerDespertar } from "../progression";
import "../../skills/handlers/index";
import { awakeningOf, deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { settled } from "../../__tests__/fixtures";
import { testEngine } from "@/core/__tests__/testEngine";
import { gameOf, withGame } from "../../../engine/state"; // popula registry

function makeState() {
	let state = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	state = reducer(testEngine, state, {
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
		expect(gameOf(state).subbosses.available).toHaveLength(0);
		expect(gameOf(state).subbosses.defeated).toHaveLength(0);
	});

	it("ao chegar a Despertar 3, desbloqueia as salas sem duplicar cartas", () => {
		let state = makeState();
		// very_easy: heroOffset=2, então herói já começa em impeto=2 e despertar=0
		// Forçar despertar para 2 para que level-up avance para 3
		const heroId = heroesOf(state)[0]!.id;
		state = withAwakening(withGame(state, (prevGame) => ({ ...prevGame, groupXp: 10 })), 2);
		const deckBefore = deckOf(state, "dungeonDeck").available.length;

		state = reducer(testEngine, state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});

		// Despertar agora é 3
		expect(awakeningOf(state)).toBe(3);
		// Salas de subchefe já estavam no baralho inicial: não injetar novamente.
		expect(gameOf(state).subbosses.available).toHaveLength(2);
		expect(deckOf(state, "dungeonDeck").available.length).toBe(deckBefore);
		// Os IDs das salas estão no deck
		for (const id of gameOf(state).subbosses.available) {
			expect(deckOf(state, "dungeonDeck").available).toContain(id);
		}
	});

	it("não duplica salas ao evoluir novamente após o desbloqueio", () => {
		let state = makeState();
		const heroId = heroesOf(state)[0]!.id;
		state = withAwakening(withGame(state, (prevGame) => ({ ...prevGame, groupXp: 99 })), 2);
		// Primeiro desbloqueio (Despertar 2 → 3)
		state = reducer(testEngine, state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});
		expect(awakeningOf(state)).toBe(3);
		const availableAfterFirst = [...gameOf(state).subbosses.available];
		const deckAfterFirst = [...deckOf(state, "dungeonDeck").available];

		// Segundo level-up: Despertar 3 → 4, sem modificar o deck
		state = reducer(testEngine, state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});
		expect(awakeningOf(state)).toBe(4);
		// subbosses.available não cresceu (pode ter diminuído se algum foi derrotado, mas aqui 0 derrotados)
		expect(gameOf(state).subbosses.available).toEqual(availableAfterFirst);
		expect(deckOf(state, "dungeonDeck").available).toEqual(deckAfterFirst);
	});

	it("não instala cópias ECS dos gatilhos Roxos de catálogo", () => {
		let state = makeState();
		const heroId = heroesOf(state)[0]!.id;
		const enemy = {
			id: "e-purple",
			cardId: "creature_dark_cave_goblin",
			maxLife: 8,
			currentLife: 8,
			damage: 2,
			hitBonus: 0,
			dice: 1,
			tokens: {},
			conditions: [],
			firstDamageTakenThisTurn: false,
			status: "active" as const,
		};
		state = withAwakening(settled(withGame(state, (prevGame) => ({ ...prevGame, groupXp: 10, activeEnemies: [enemy], world: spawnEnemy(gameOf(state).world, enemy) }))), 3);

		state = reducer(testEngine, state, {
			type: "SPEND_XP",
			payload: { option: "level_up", heroId },
		});
		expect(awakeningOf(state)).toBe(4);
		expect(
			gameOf(state).world.entities[enemy.id]?.components.some(
				(component) =>
					"source" in component && component.source === "purple_dark_tribute",
			),
		).toBe(false);

		state = lowerDespertar(testEngine, state);
		expect(awakeningOf(state)).toBe(3);
		expect(
			gameOf(state).world.entities[enemy.id]?.components.some(
				(component) =>
					"source" in component && component.source === "purple_dark_tribute",
			),
		).toBe(false);
	});

	it("revelar sala de subchefe spawna o subchefe correto (sem desenhar do enemyDeck)", () => {
		let state = makeState();

		// Injetar salas de subchefe manualmente no topo do deck
		state = withDecks(withGame(withAwakening(state, 3), (prevGame) => ({ ...prevGame, currentRoom: null, status: "REVEAL_ROOM", roomsCleared: 4, subbosses: {
				available: [
					"subboss_room_jailer_chamber",
					"subboss_room_cracked_abyss_chamber",
				],
				defeated: [],
			} })), {
				...decksOf(state),
				dungeonDeck: {
					...deckOf(state, "dungeonDeck"),
					available: ["subboss_room_jailer_chamber"],
				},
			});
		const enemyDeckSizeBefore = deckOf(state, "enemyDeck").available.length;

		state = reducer(testEngine, state, { type: "REVEAL_ROOM" });

		// Deve ter ido direto para COMBAT_START
		expect(gameOf(state).status).toBe("COMBAT_START");
		// Sala atual é a câmara
		expect(gameOf(state).currentRoom?.cardId).toBe("subboss_room_jailer_chamber");
		// O subchefe foi spawniado como enemy ativo
		expect(enemiesOf(state)).toHaveLength(1);
		expect(enemiesOf(state)[0]!.cardId).toBe(
			"subboss_crimson_dungeon_jailer",
		);
		expect(enemiesOf(state)[0]!.isSubboss).toBe(true);
		// Enemy deck não foi tocado
		expect(deckOf(state, "enemyDeck").available.length).toBe(enemyDeckSizeBefore);
		// Herói foi selecionado inicialmente via START_GAME — não verificamos aqui
		// O deck de dungeon consumiu a carta
		expect(deckOf(state, "dungeonDeck").available).not.toContain(
			"subboss_room_jailer_chamber",
		);
	});
});

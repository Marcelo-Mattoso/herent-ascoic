// Handler de START_GAME: monta estado inicial, embaralha decks, cria herói ativo.

import {
	getArtifacts,
	getCardByName,
	getCreatures,
	getItems,
	getRooms,
} from "../../data/cards";
import { createEmptyCombatState } from "../state/combatState";
import type { GameConfig, GameState } from "../state/gameState";
import { selectBoss } from "../strategies/bossSelection";
import { createHeroFromCard, log, shuffle } from "./utils";

export function handleStartGame(
	state: GameState,
	payload: GameConfig,
): GameState {
	const heroCard = getCardByName(payload.heroCardName);
	if (!heroCard || heroCard.type !== "hero") {
		return log(
			state,
			`[ERRO] Carta de herói não encontrada: ${payload.heroCardName}`,
		);
	}

	const hero = createHeroFromCard(heroCard, 0);
	const bossName = payload.bossCardName ?? selectBoss();

	const roomNames = getRooms().map((c) => c.name);
	const creatureNames = getCreatures().map((c) => c.name);
	const itemNames = getItems().map((c) => c.name);
	const artifactNames = getArtifacts().map((c) => c.name);

	const next: GameState = {
		...state,
		difficulty: payload.difficulty ?? "normal",
		status: "REVEAL_ROOM",
		groupXp: 0,
		despertar: 0,
		heroes: [hero],
		defeatedHeroes: [],
		activeEnemies: [],
		enemyGraveyard: [],
		bossCardName: bossName,
		bossDefeated: false,
		groupArtifacts: [],
		currentRoom: null,
		paths: [],
		roomsCleared: 0,
		creaturesDefeated: 0,
		combat: createEmptyCombatState(),
		decks: {
			dungeonDeck: {
				available: shuffle(roomNames),
				discarded: [],
				removed: [],
			},
			enemyDeck: {
				available: shuffle(creatureNames),
				discarded: [],
				removed: [],
			},
			itemDeck: { available: shuffle(itemNames), discarded: [], removed: [] },
			artifactDeck: {
				available: shuffle(artifactNames),
				discarded: [],
				removed: [],
			},
		},
		eventLog: [`Partida iniciada. Herói: ${heroCard.name}. Boss: ${bossName}.`],
	};

	return next;
}

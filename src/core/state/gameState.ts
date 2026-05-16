// Estado raiz da partida. Contém tudo que o reducer precisa para processar qualquer action.
// Criado por createInitialGameState e nunca mutado diretamente — sempre substituído pelo reducer.

import type { ColorIndex } from "./color";
import type { CombatState } from "./combatState";
import { createEmptyCombatState } from "./combatState";
import type { DeckState } from "./deckState";
import { createEmptyDeck } from "./deckState";
import type { EnemyState } from "./enemyState";
import type { HeroState } from "./heroState";
import type { RoomState } from "./roomState";
import type { GameStatus } from "./status";

export type Difficulty = "very_easy" | "easy" | "normal" | "hard" | "nightmare";

export type GameMode = "solo";

export interface GroupArtifact {
	readonly cardName: string;
	// Herói que carrega o artefato (null = artefato do grupo sem portador definido)
	readonly carriedBy: string | null;
}

export interface GameDecks {
	readonly dungeonDeck: DeckState;
	readonly enemyDeck: DeckState;
	readonly itemDeck: DeckState;
	readonly artifactDeck: DeckState;
}

export interface GameState {
	readonly gameId: string;
	readonly mode: GameMode;
	readonly difficulty: Difficulty;
	status: GameStatus;

	// Progressão
	groupXp: number;
	despertar: ColorIndex;

	// Heróis
	readonly heroes: readonly HeroState[];
	readonly defeatedHeroes: readonly HeroState[];

	// Sala atual e inimigos
	currentRoom: RoomState | null;
	readonly activeEnemies: readonly EnemyState[];
	readonly enemyGraveyard: readonly EnemyState[];

	// Boss
	readonly bossCardName: string;
	bossDefeated: boolean;

	// Artefatos do grupo
	readonly groupArtifacts: readonly GroupArtifact[];

	// Decks
	readonly decks: GameDecks;

	// Cartas de caminho reveladas aguardando escolha
	readonly paths: readonly string[];

	// Estatísticas da partida
	roomsCleared: number;
	creaturesDefeated: number;

	// Estado de combate corrente (null fora de combate)
	combat: CombatState | null;

	// Log de eventos para debug e UI
	readonly eventLog: readonly string[];
}

export interface GameConfig {
	heroCardName: string;
	difficulty?: Difficulty;
	bossCardName?: string;
}

export function createInitialGameState(config: GameConfig): GameState {
	return {
		gameId: crypto.randomUUID(),
		mode: "solo",
		difficulty: config.difficulty ?? "normal",
		status: "MAIN_MENU",

		groupXp: 0,
		despertar: 0,

		heroes: [],
		defeatedHeroes: [],

		currentRoom: null,
		activeEnemies: [],
		enemyGraveyard: [],

		bossCardName: config.bossCardName ?? "Azhakar, Dragão da Fornalha Sombria",
		bossDefeated: false,

		groupArtifacts: [],

		decks: {
			dungeonDeck: createEmptyDeck(),
			enemyDeck: createEmptyDeck(),
			itemDeck: createEmptyDeck(),
			artifactDeck: createEmptyDeck(),
		},

		paths: [],

		roomsCleared: 0,
		creaturesDefeated: 0,

		combat: createEmptyCombatState(),

		eventLog: [],
	};
}

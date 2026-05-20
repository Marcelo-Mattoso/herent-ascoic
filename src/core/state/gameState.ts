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
	readonly fledHeroes: readonly HeroState[];

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

	// Fila de recompensas aguardando resolução (itens e artefatos pendentes)
	readonly pendingRewards: readonly PendingReward[];

	// Flags de uso por escopo "once_per_game" (key = skillId ou "skillId::heroId")
	readonly oncePer: {
		readonly game: Readonly<Record<string, boolean>>;
	};

	// Flags globais de mecânicas (ex: discardDungeonLocked)
	readonly flags: Readonly<Record<string, boolean>>;

	// Escolha pendente de skill aguardando input do jogador
	pendingSkillChoice?: {
		readonly skillId: string;
		readonly prompt: string;
		readonly options: readonly { readonly id: string; readonly label: string }[];
		readonly sourceHeroId?: string;
	};

	// Log de eventos para debug e UI
	readonly eventLog: readonly string[];
}

// Recompensa pendente aguardando resolução pelo jogador.
export interface PendingReward {
	readonly type: "item" | "artifact";
	readonly cardName: string;
	// Verdadeiro quando o artefato possui campo "portador" e precisa de escolha.
	readonly requiresBearer: boolean;
}

export interface GameConfig {
	// Suporta 1 a 8 heróis. Mantido como array; UI garante pelo menos 1 elemento.
	heroCardNames: string[];
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
		fledHeroes: [],

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

		pendingRewards: [],

		oncePer: { game: {} },

		flags: {},

		eventLog: [],
	};
}

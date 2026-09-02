// Estado raiz da partida. Contém tudo que o reducer precisa para processar qualquer action.
// Criado por createInitialGameState e nunca mutado diretamente — sempre substituído pelo reducer.

import type { LoggedAction } from "../actions/types";
import type { World } from "../ecs/world";
import { createEmptyWorld } from "../ecs/world";
import type { EffectStack, PausedState } from "../effects/stack";
import { createEmptyEffectStack } from "../effects/stack";
import type { RngState } from "../ports/random";
import { createRng } from "../ports/random";
import type { PendingTriggerInterrupt } from "../triggers/engine";
import type { PendingSkillWindow } from "../skills/resolveSkillWindow";
import type { ActivationLocks } from "./activation";
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

// Entrada de bloco com duração. Usada em GameState.blocks para rastrear
// blocos de ação (fuga, cura, etc.) que expiram em algum escopo.
export interface BlockEntry {
	readonly source: string;
	readonly duration: import("../skills/dsl/types").DurationNode;
	readonly sourceEntityId?: string;
}

export type GameMode = "cooperative" | "competitive";

export interface GroupArtifact {
	readonly cardId: string;
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
	readonly rng: RngState;
	status: GameStatus;

	// ECS world — espelha heroes/enemies durante a transição (Passos 5-6).
	// Fonte primária a partir do Passo 6; heroes/enemies tornam-se campos derivados.
	readonly world: World;

	// Effect stack — fila de efeitos pendentes (Passo 8).
	// Drenada pelo reducer ao fim de cada action.
	readonly effectStack: EffectStack;

	// Pausa para input do jogador durante resolução de efeitos (Passo 8).
	readonly paused: PausedState | null;

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
	readonly bossCardId: string;
	bossDefeated: boolean;

	// Em modo competitivo, nome do herói/jogador vencedor (definido ao atingir VICTORY)
	readonly winner?: string;

	// Subchefes (injetados quando Despertar atinge 3)
	readonly subbosses: {
		readonly available: readonly string[];
		readonly defeated: readonly string[];
	};

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

	// Estado genérico de ativação/desativação fora do combate.
	// Bloqueios de rodada/combate vivem em CombatState.disabled.
	readonly disabled: ActivationLocks;

	// Flags globais de mecânicas (ex: discardDungeonLocked)
	readonly flags: Readonly<Record<string, boolean>>;

	// Blocos de ações com duração (ex: fleeBlocked, discardDungeonLocked, heroId::healBlocked).
	// O bloco está ativo enquanto o array tiver ao menos uma entrada.
	// Limpo por tickBlockEntries() e removeBlocksForSource().
	readonly blocks: Readonly<Record<string, readonly BlockEntry[]>>;

	// Tokens persistentes fora do combate (chave: `${ownerId}::${type}`)
	readonly tokens: Readonly<
		Record<
			string,
			{
				readonly count: number;
				readonly ownerId: string;
				readonly type: string;
			}
		>
	>;

	// Escolha pendente de skill aguardando input do jogador
	pendingSkillChoice?: {
		readonly skillId: string;
		readonly prompt: string;
		readonly options: readonly {
			readonly id: string;
			readonly label: string;
			readonly params?: Readonly<Record<string, number | string>>;
			/** DSL: efeito a avaliar quando esta opção for escolhida (Patch-12 Lote 3+). */
			readonly effect?: readonly import("../skills/dsl/types").EffectNode[];
		}[];
		readonly sourceHeroId?: string;
		readonly targetHeroIds?: readonly string[];
		readonly targetEnemyIds?: readonly string[];
	};

	// Interrupção de trigger aguardando decisão do jogador.
	// Gerada por habilidades/itens/inimigos que reagem a uma fase do jogo.
	pendingTriggerInterrupt?: PendingTriggerInterrupt;
	pendingSkillWindow?: PendingSkillWindow;

	// Log de eventos para debug e UI
	readonly eventLog: readonly string[];

	// Log autoritativo de todas as actions despachadas (passo 1)
	readonly actionLog: readonly LoggedAction[];
}

// Recompensa pendente aguardando resolução pelo jogador.
export interface PendingReward {
	readonly type: "item" | "artifact";
	readonly cardId: string;
	// Verdadeiro quando o artefato possui campo "portador" e precisa de escolha.
	readonly requiresBearer: boolean;
}

export interface GameConfig {
	// Suporta 1 a 8 heróis. Mantido como array; UI garante pelo menos 1 elemento.
	heroCardIds: string[];
	difficulty?: Difficulty;
	bossCardId?: string;
	mode?: GameMode;
}

export function createInitialGameState(config: GameConfig): GameState {
	return {
		gameId: "__PREGAME__",
		mode: "cooperative",
		difficulty: config.difficulty ?? "normal",
		rng: createRng(0),
		status: "MAIN_MENU",
		world: createEmptyWorld(),
		effectStack: createEmptyEffectStack(),
		paused: null,

		groupXp: 0,
		despertar: 0,

		heroes: [],
		defeatedHeroes: [],
		fledHeroes: [],

		currentRoom: null,
		activeEnemies: [],
		enemyGraveyard: [],

		bossCardId: config.bossCardId ?? "",
		bossDefeated: false,

		subbosses: { available: [], defeated: [] },

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

		disabled: {},

		flags: {},

		blocks: {},

		tokens: {},

		eventLog: [],

		actionLog: [],
	};
}

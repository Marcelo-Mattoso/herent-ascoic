import type { ColorIndex } from "./color";
import type { PoisonTelemetry } from "../rules/poisonTelemetry";
// Estado raiz da partida. Contém tudo que o reducer precisa para processar qualquer action.
// Criado por createInitialGameState e nunca mutado diretamente — sempre substituído pelo reducer.

import type { LoggedAction } from "../actions/types";
import type { GameEvent } from "../events/types";
import type { World } from "../ecs/world";
import { createEmptyWorld } from "../ecs/world";
import type { RngState } from "../ports/random";
import { createRng } from "../ports/random";
import type { PreparedAbility } from "../abilities/prepared";
import type { GameState as EngineGameState } from "../../engine/state";
import type { ActivationLocks } from "./activation";
import type { CombatState } from "./combatState";
import { createEmptyCombatState } from "./combatState";
import { createDeckEngine } from "./zones";
import type { EnemyRecord } from "./enemyState";
import type { HeroRecord } from "./heroState";
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

export interface AscensaoGame {
	readonly gameId: string;
	readonly mode: GameMode;
	readonly difficulty: Difficulty;
	readonly rng: RngState;
	status: GameStatus;

	// ECS world — espelha heroes/enemies durante a transição (Passos 5-6).
	// Fonte primária a partir do Passo 6; heroes/enemies tornam-se campos derivados.
	readonly world: World;

	// Progressão
	groupXp: number;
	/** Patamar coletivo de Ímpeto mais alto já atingido por todos os heróis. */
	groupImpetoMilestone: ColorIndex;

	// Heróis
	readonly heroes: readonly HeroRecord[];
	readonly defeatedHeroes: readonly HeroRecord[];
	readonly fledHeroes: readonly HeroRecord[];

	// Sala atual e inimigos
	currentRoom: RoomState | null;
	readonly activeEnemies: readonly EnemyRecord[];
	readonly enemyGraveyard: readonly EnemyRecord[];

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
	/** Voluntary reactions armed before their event, including exploration reactions. */
	readonly preparedAbilities?: Readonly<Record<string, PreparedAbility>>;

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

	// Log de eventos para debug e UI
	readonly eventLog: readonly string[];
	/** Histórico técnico exclusivo da fase alpha, separado do log do jogador. */
	readonly alphaLog?: readonly string[];
	/** Observações visuais do dano realmente subtraído da vida; sem efeito nas regras. */
	/** Dano periódico efetivo de veneno e pontos protegidos pelo Coração, cumulativos na partida. */
	readonly poisonTelemetry?: PoisonTelemetry;
	readonly damageFeedback?: readonly {
		readonly id: number;
		readonly targetId: string;
		readonly side: "hero" | "enemy";
		readonly amount: number;
		readonly extraAttackId?: number;
	}[];
	readonly healFeedback?: readonly {
		readonly id: number;
		readonly targetId: string;
		readonly amount: number;
	}[];
	/** Ataques excedentes já resolvidos pela engine, para encenação posterior na UI. */
	readonly extraAttackFeedback?: readonly {
		readonly id: number;
		readonly enemyId: string;
		readonly enemyCardId: string;
		readonly heroId: string;
	}[];

	// Eventos estruturados tipados: saída verificável das regras (eventLog é texto derivado/paralelo)
	readonly events: readonly GameEvent[];

	// Log autoritativo de todas as actions despachadas (passo 1)
	readonly actionLog: readonly LoggedAction[];
}

export type GameState = EngineGameState<AscensaoGame>;

// Recompensa pendente aguardando resolução pelo jogador.
export interface PendingReward {
	readonly type: "item" | "artifact";
	readonly cardId: string;
	// Verdadeiro quando o artefato possui campo "portador" e precisa de escolha.
	readonly requiresBearer: boolean;
}

export const MAX_HEROES = 4;

export interface GameConfig {
	// Suporta de 1 a 4 heróis. Mantido como array; UI garante pelo menos 1 elemento.
	heroCardIds: string[];
	difficulty?: Difficulty;
	bossCardId?: string;
	mode?: GameMode;
}

export function createInitialGameState(config: GameConfig): GameState {
	const game: AscensaoGame = {
		gameId: "__PREGAME__",
		mode: "cooperative",
		difficulty: config.difficulty ?? "normal",
		rng: createRng(0),
		status: "MAIN_MENU",
		world: createEmptyWorld(),

		groupXp: 0,
		groupImpetoMilestone: 0,

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

		events: [],

		actionLog: [],
	};
	return { engine: createDeckEngine(), game };
}

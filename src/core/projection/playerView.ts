// Projeção do estado de jogo para a UI.
// Camada de tradução entre GameState (shape interno) e PlayerView (contrato estável da UI).
// Quando o shape interno mudar (Fase 2 ECS), a UI continua lendo a mesma forma.

import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import type { RoomState } from "../state/roomState";
import type { ColorIndex } from "../state/color";
import type { GameStatus } from "../state/status";

// Aliases estruturais — iguais ao shape interno por enquanto.
// Mudam na Fase 2 quando ECS entra: a projeção reconstruirá HeroView a partir de componentes.
export type HeroView = HeroState;
export type EnemyView = EnemyState;
export type RoomView = RoomState;

export interface PlayerView {
	readonly status: GameStatus;
	readonly heroes: readonly HeroView[];
	readonly enemies: readonly EnemyView[];
	readonly currentRoom: RoomView | null;
	readonly combat: {
		readonly heroesActed: readonly string[];
		readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
	} | null;
	readonly groupXp: number;
	readonly despertar: ColorIndex;
	readonly decks: {
		readonly dungeonDeck: { readonly discarded: readonly string[] };
		readonly artifactDeck: { readonly available: readonly string[] };
		readonly itemDeck: { readonly available: readonly string[] };
	};
}

export function playerView(state: GameState): PlayerView {
	return {
		status: state.status,
		heroes: state.heroes,
		enemies: state.activeEnemies,
		currentRoom: state.currentRoom,
		combat: state.combat
			? {
					heroesActed: state.combat.heroesActed,
					powersUsedThisRoom: state.combat.powersUsedThisRoom,
				}
			: null,
		groupXp: state.groupXp,
		despertar: state.despertar,
		decks: {
			dungeonDeck: { discarded: state.decks.dungeonDeck.discarded },
			artifactDeck: { available: state.decks.artifactDeck.available },
			itemDeck: { available: state.decks.itemDeck.available },
		},
	};
}

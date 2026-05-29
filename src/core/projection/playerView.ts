// Projeção do estado de jogo para a UI.
// Camada de tradução entre GameState (shape interno) e PlayerView (contrato estável da UI).
// Quando o shape interno mudar (ECS, effect stack), a UI continua lendo a mesma forma.
//
// Passo 9: adicionados campos pós-ECS — paused e pendingSkillChoice.

import type { PausedState } from "../effects/stack";
import type { ColorIndex } from "../state/color";
import type { CombatPhase, CombatRollResult } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import type { RoomState } from "../state/roomState";
import type { GameStatus } from "../state/status";

// Aliases estruturais — iguais ao shape interno por enquanto.
// Mudam quando ECS entra plenamente: a projeção reconstruirá HeroView a partir de componentes.
export type HeroView = HeroState;
export type EnemyView = EnemyState;
export type RoomView = RoomState;

export interface PlayerView {
	readonly status: GameStatus;
	readonly heroes: readonly HeroView[];
	readonly enemies: readonly EnemyView[];
	readonly currentRoom: RoomView | null;
	readonly combat: {
		readonly phase: CombatPhase;
		readonly selectedHeroId: string | null;
		readonly round: number;
		readonly heroesActed: readonly string[];
		readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
		readonly lastRoll: CombatRollResult | null;
	} | null;
	readonly groupXp: number;
	readonly despertar: ColorIndex;
	readonly decks: {
		readonly dungeonDeck: { readonly discarded: readonly string[] };
		readonly artifactDeck: { readonly available: readonly string[] };
		readonly itemDeck: { readonly available: readonly string[] };
	};
	// Passo 8: estado de pausa para input do jogador durante resolução de efeitos.
	readonly paused: PausedState | null;
	// Escolha de skill pendente (integrada ao paused no futuro; mantida para compatibilidade).
	readonly pendingSkillChoice: {
		readonly skillId: string;
		readonly prompt: string;
		readonly options: readonly {
			readonly id: string;
			readonly label: string;
		}[];
		readonly sourceHeroId?: string;
	} | null;
}

export function playerView(state: GameState): PlayerView {
	return {
		status: state.status,
		heroes: state.heroes,
		enemies: state.activeEnemies,
		currentRoom: state.currentRoom,
		combat: state.combat
			? {
					phase: state.combat.phase,
					selectedHeroId: state.combat.selectedHeroId,
					round: state.combat.round,
					heroesActed: state.combat.heroesActed,
					powersUsedThisRoom: state.combat.powersUsedThisRoom,
					lastRoll: state.combat.lastRoll,
				}
			: null,
		groupXp: state.groupXp,
		despertar: state.despertar,
		decks: {
			dungeonDeck: { discarded: state.decks.dungeonDeck.discarded },
			artifactDeck: { available: state.decks.artifactDeck.available },
			itemDeck: { available: state.decks.itemDeck.available },
		},
		paused: state.paused,
		pendingSkillChoice: state.pendingSkillChoice ?? null,
	};
}

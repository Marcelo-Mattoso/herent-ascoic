import type { EntityId, EntityType } from "../ecs/types";
import type { GameState } from "../state/gameState";
import type { GameStatus } from "../state/status";
import { enemiesOf, heroesOf } from "../state/access";
import { gameOf } from "../../engine/state";

// Vista pública de uma entidade — sem componentes internos nem metadados privados.
export interface EntityView {
	readonly id: EntityId;
	readonly type: EntityType;
	readonly currentHealth: number;
	readonly maxHealth: number;
	readonly conditions: readonly string[];
}

// Ação disponível do ponto de vista da IA.
// Skeleton para expansão futura quando a IA for implementada.
export interface AiAvailableAction {
	readonly type: string;
	readonly description: string;
}

export interface AiView {
	readonly status: GameStatus;
	readonly visibleEntities: readonly EntityView[];
	readonly availableActions: readonly AiAvailableAction[];
	// Explicitamente ausente: rng, world, deckTop, actionLog, effectStack,
	// mãos privadas de outros jogadores.
}

export function aiView(
	state: GameState,
	_perspective: { readonly playerIndex: number },
): AiView {
	const visibleEntities: EntityView[] = [];

	// Heróis ativos são visíveis para a IA.
	for (const hero of heroesOf(state)) {
		if (hero.status !== "active") continue;
		visibleEntities.push({
			id: hero.id,
			type: "hero",
			currentHealth: hero.currentLife,
			maxHealth: hero.maxLife,
			conditions: hero.conditions,
		});
	}

	// Inimigos ativos são visíveis para a IA.
	for (const enemy of enemiesOf(state)) {
		if (enemy.status !== "active") continue;
		visibleEntities.push({
			id: enemy.id,
			type: "enemy",
			currentHealth: enemy.currentLife,
			maxHealth: enemy.maxLife,
			conditions: enemy.conditions,
		});
	}

	// availableActions: skeleton — será populado quando a IA for implementada.
	const availableActions: AiAvailableAction[] = [];

	return {
		status: gameOf(state).status,
		visibleEntities,
		availableActions,
	};
}

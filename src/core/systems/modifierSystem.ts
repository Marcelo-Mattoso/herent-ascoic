// Sistema de modificadores — consulta modificadores ativos via ECS.
// Passo 6: apenas a query utilitária. A aplicação em tempo real vem no Passo 7 (event bus).

import type { EntityId, ModifierComponent } from "../ecs/types";
import { queryWithComponent } from "../ecs/world";
import type { World } from "../ecs/world";

export function queryActiveModifiers(
	world: World,
	targetId: EntityId,
	modifierTarget: ModifierComponent["target"],
): readonly ModifierComponent[] {
	return queryWithComponent<ModifierComponent>(world, "modifier")
		.filter(
			({ entity, component }) =>
				entity.id === targetId && component.target === modifierTarget,
		)
		.map(({ component }) => component);
}

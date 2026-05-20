// Handler da action USE_SKILL.
// Valida que a habilidade tem trigger "on_use" (ou variante), resolve e executa o handler.

import { SKILLS } from "../../data/skills";
import { getHandler } from "./registry";
import type { GameState } from "../state/gameState";
import { log } from "../reducer/utils";

export interface UseSkillPayload {
	skillId: string;
	sourceId: string;
	targetIds?: string[];
	value?: number | string | null;
}

export function fireOnUseSkill(state: GameState, payload: UseSkillPayload): GameState {
	const { skillId, sourceId, targetIds, value } = payload;

	const def = SKILLS.abilities.find((a) => a.id === skillId);
	if (!def) {
		return log(state, `[AVISO] Skill não encontrada: ${skillId}`);
	}

	// Verificar que trigger é do tipo "on_use" (ou variante once_per_X)
	const isUsable =
		def.trigger === "on_use" ||
		def.trigger === "once_per_game" ||
		def.trigger === "once_per_room" ||
		def.trigger === "once_per_combat" ||
		def.trigger.includes("on_use");
	if (!isUsable) {
		return log(state, `[AVISO] Skill ${skillId} não é ativável manualmente (trigger: ${def.trigger})`);
	}

	const handler = getHandler(def.type);
	if (!handler) {
		return log(state, `[SKILL NÃO IMPLEMENTADA: ${skillId}]`);
	}

	// Resolve value: payload.value tem prioridade, fallback para usedBy[].value
	const resolvedValue =
		value !== undefined
			? value
			: def.usedBy.find((u) => u.card === sourceId)?.value ?? def.defaultValue;

	return handler(state, {
		triggeredBy: "on_use",
		sourceHeroId: state.heroes.some((h) => h.id === sourceId) ? sourceId : undefined,
		targetHeroIds: targetIds?.filter((id) => state.heroes.some((h) => h.id === id)),
		targetEnemyIds: targetIds?.filter((id) => state.activeEnemies.some((e) => e.id === id)),
		skillId,
		value: resolvedValue,
	}, resolvedValue);
}

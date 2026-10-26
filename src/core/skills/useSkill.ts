// Adaptador público da action legada USE_SKILL. A execução usa AbilityGrant.

import { cardAbilityGrants } from "../data/abilities";
import { SKILLS } from "../data/skills";
import type { SkillDefinition } from "../data/skillTypes";
import { executeAbilityGrant } from "../abilities/executor";
import { log } from "../reducer/utils";
import type { GameState } from "../state/gameState";
import { resolveManualSkillTarget } from "./targeting";

export function isManuallyActivatable(def: SkillDefinition): boolean {
	return def.operate_type === "op_active" || def.operate_type === "op_active_buff";
}

export interface UseSkillPayload {
	skillId: string;
	sourceId: string;
	targetIds?: string[];
	value?: number | string | null;
	params?: Readonly<Record<string, unknown>>;
}

/** Compatibilidade para consumidores diretos; a UI passa pelo reducer. */
export function fireOnUseSkill(state: GameState, payload: UseSkillPayload): GameState {
	const def = SKILLS.abilities.find((ability) => ability.id === payload.skillId);
	if (!def) return log(state, `[AVISO] Skill não encontrada: ${payload.skillId}`);
	if (!isManuallyActivatable(def))
		return log(state, `[AVISO] Skill ${payload.skillId} não é ativável manualmente (trigger: ${def.trigger})`);
	const hero = state.heroes.find((entry) => entry.id === payload.sourceId && entry.status === "active");
	if (!hero) return log(state, "[AVISO] Herói de origem inválido.");
	const grant = cardAbilityGrants(hero.cardId).find((entry) =>
		entry.abilityId === payload.skillId && entry.activation.kind === "manual");
	if (!grant) return log(state, "[AVISO] Esta habilidade não pertence ao herói.");
	const target = resolveManualSkillTarget(state, def, hero.id, payload.targetIds);
	if (target.kind !== "ready")
		return log(state, `[AVISO] ${target.kind === "unavailable" ? target.reason : target.prompt}`);
	return executeAbilityGrant(state, {
		source: { kind: "hero", cardId: hero.cardId, sourceHeroId: hero.id },
		grant: payload.params ? { ...grant, params: { ...grant.params, ...payload.params } } : grant,
		triggeredBy: "manual", targetIds: target.targetIds, value: payload.value,
	});
}

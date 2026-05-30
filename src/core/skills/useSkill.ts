// Handler da action USE_SKILL.
// Valida que a habilidade tem trigger "on_use" (ou variante), resolve e executa o handler.

import { SKILLS } from "../data/skills";
import type { SkillContext, SkillDefinition } from "../data/skillTypes";
import { emit } from "../events/bus";
import { log } from "../reducer/utils";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import type { GameState } from "../state/gameState";
import { evaluate } from "./dsl/evaluate";
import { cardSkills } from "./lookup";

export function isManuallyActivatable(def: SkillDefinition): boolean {
	const t = def.trigger;
	// Triggers reativos a evento têm "_on_" ou "_after_" no meio
	// (ex: once_per_room_on_dungeon_discard) — NÃO são ativáveis manualmente.
	const isReactive = t.includes("_on_") || t.includes("_after_");
	const isManualScope =
		t.startsWith("once_per_game") ||
		t.startsWith("once_per_room") ||
		t.startsWith("once_per_combat");
	return t === "on_use" || t.includes("on_use") || (isManualScope && !isReactive);
}

export interface UseSkillPayload {
	skillId: string;
	sourceId: string;
	targetIds?: string[];
	value?: number | string | null;
}

export function fireOnUseSkill(
	state: GameState,
	payload: UseSkillPayload,
): GameState {
	const { skillId, sourceId, targetIds, value } = payload;

	const def = SKILLS.abilities.find((a) => a.id === skillId);
	if (!def) {
		return log(state, `[AVISO] Skill não encontrada: ${skillId}`);
	}

	// Verificar que trigger é do tipo "on_use" (ou variante once_per_X)
	if (!isManuallyActivatable(def)) {
		return log(
			state,
			`[AVISO] Skill ${skillId} não é ativável manualmente (trigger: ${def.trigger})`,
		);
	}

	// Resolve value: payload.value tem prioridade, fallback para params da carta ou defaultValue.
	const sourceCardId =
		state.heroes.find((h) => h.id === sourceId)?.cardId ??
		state.activeEnemies.find((e) => e.id === sourceId)?.cardId;
	const cardRef = sourceCardId
		? cardSkills(sourceCardId).find(({ def: d }) => d.id === skillId)?.ref
		: undefined;
	const resolvedValue =
		value !== undefined ? value : (cardRef?.params?.value ?? def.defaultValue);

	const resolvedCtx: SkillContext = {
		triggeredBy: "on_use",
		sourceHeroId: state.heroes.some((h) => h.id === sourceId)
			? sourceId
			: undefined,
		sourceEnemyId: state.activeEnemies.some((e) => e.id === sourceId)
			? sourceId
			: undefined,
		targetHeroIds: targetIds?.filter((id) =>
			state.heroes.some((h) => h.id === id),
		),
		targetEnemyIds: targetIds?.filter((id) =>
			state.activeEnemies.some((e) => e.id === id),
		),
		skillId,
		value: resolvedValue,
	};

	// Ordem de resolução: DSL → script.
	const params: Record<string, unknown> = {
		...(def.params ?? {}),
		...(cardRef?.params ?? {}),
		value: resolvedValue,
	};

	// Lote E: emite SkillUsed antes de executar
	let stateBeforeExec = state;
	({ state: stateBeforeExec } = emit(stateBeforeExec, {
		type: "SkillUsed",
		payload: { sourceId, skillId },
	}));

	if (def.effect) {
		const evalCtx = buildScriptCtx(stateBeforeExec, resolvedCtx, params);
		return evaluate(def.effect, evalCtx);
	}

	if (def.script) {
		const fn = getScript(`${def.script}.run`);
		if (!fn) {
			return log(stateBeforeExec, `[SCRIPT NÃO ENCONTRADO: ${def.script}.run]`);
		}
		return fn(buildScriptCtx(stateBeforeExec, resolvedCtx, params));
	}

	return log(stateBeforeExec, `[AVISO] Skill sem implementação (sem effect ou script): ${skillId}`);
}

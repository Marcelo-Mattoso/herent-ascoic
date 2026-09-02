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
	return (
		def.operate_type === "op_active" || def.operate_type === "op_active_buff"
	);
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
	const rawResolvedValue =
		value !== undefined
			? value
			: (cardRef?.params?.value ?? def.params?.value ?? null);
	const resolvedValue =
		typeof rawResolvedValue === "number" ||
		typeof rawResolvedValue === "string" ||
		rawResolvedValue === null
			? rawResolvedValue
			: null;

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

	// Debitar custo da habilidade
	if (def.cost) {
		const { hp = 0 } = def.cost;
		if (hp > 0) {
			const hero = stateBeforeExec.heroes.find((h) => h.id === sourceId);
			if (hero && hero.currentLife <= hp) {
				return log(
					stateBeforeExec,
					`[AVISO] ${skillId}: custo de vida insuficiente`,
				);
			}
			stateBeforeExec = stateBeforeExec.heroes.some((h) => h.id === sourceId)
				? {
						...stateBeforeExec,
						heroes: stateBeforeExec.heroes.map((h) =>
							h.id === sourceId ? { ...h, currentLife: h.currentLife - hp } : h,
						),
					}
				: stateBeforeExec;
		}
	}

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

	return log(
		stateBeforeExec,
		`[AVISO] Skill sem implementação (sem effect ou script): ${skillId}`,
	);
}

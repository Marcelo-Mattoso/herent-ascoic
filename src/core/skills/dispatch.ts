// Engine de dispatch de habilidades.
// fireTrigger(state, trigger, ctx) percorre todas as habilidades "em jogo",
// filtra por trigger, e executa o handler registrado para cada skill.
//
// Ordem de resolução (quando há múltiplos handlers para o mesmo trigger):
//   1. Heróis ativos (na ordem em state.heroes)
//   2. Itens equipados pelos heróis (weapon → armor → utility → special)
//   3. Inimigos ativos (na ordem em state.activeEnemies)
//   4. Sala atual
//   5. Artefatos do grupo
// Se dois handlers no mesmo nível conflitarem em balanceamento, adicionar
// `priority?: number` em SkillDefinition (menor = executa primeiro).

import type { SkillRef } from "../data/cardTypes";
import type { SkillContext, SkillDefinition } from "../data/skillTypes";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import type { GameState } from "../state/gameState";
import { evaluate } from "./dsl/evaluate";
import { resolveCondition } from "./dsl/resolveCondition";
import type { EventName } from "./dsl/types";
import { cardSkills } from "./lookup";

interface ActiveSkill {
	definition: SkillDefinition;
	ref: SkillRef;
	sourceHeroId?: string;
	sourceEnemyId?: string;
}

/** @deprecated Legado — usava trigger string. Mantido para compat de testes. */
export function parseTrigger(_trigger: string): {
	guard: string | null;
	base: string;
} {
	return { guard: null, base: _trigger };
}

export function guardPassed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	const cooldown = skill.cooldown;
	if (!cooldown) return true;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	switch (cooldown.scope) {
		case "game":
			return !state.oncePer?.game?.[key];
		case "room":
			return !state.combat?.oncePer?.room?.[key];
		case "combat":
			return !state.combat?.oncePer?.combat?.[key];
		case "round":
			return !state.combat?.oncePer?.round?.[key];
	}
}

export function isSkillGuardConsumed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	return !guardPassed(state, skill, sourceHeroId);
}

function markGuardUsed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): GameState {
	const cooldown = skill.cooldown;
	if (!cooldown) return state;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (cooldown.scope === "game") {
		return {
			...state,
			oncePer: {
				...state.oncePer,
				game: { ...(state.oncePer?.game ?? {}), [key]: true },
			},
		};
	}
	if (state.combat) {
		const scope = cooldown.scope as "room" | "combat" | "round";
		return {
			...state,
			combat: {
				...state.combat,
				oncePer: {
					...(state.combat.oncePer ?? {}),
					[scope]: { ...(state.combat.oncePer?.[scope] ?? {}), [key]: true },
				},
			},
		};
	}
	return state;
}

// Fontes "em jogo" com metadados de origem.
interface InPlaySource {
	cardId: string;
	sourceHeroId?: string;
	sourceEnemyId?: string;
}

function inPlaySources(state: GameState, event: EventName): InPlaySource[] {
	const sources: InPlaySource[] = [];

	// 1. Heróis ativos
	for (const hero of state.heroes.filter((h) => h.status === "active")) {
		sources.push({ cardId: hero.cardId, sourceHeroId: hero.id });

		// 2. Itens equipados pelo herói
		for (const itemId of Object.values(hero.activeItems)) {
			if (!itemId) continue;
			sources.push({ cardId: itemId, sourceHeroId: hero.id });
		}
	}

	// 3. Inimigos ativos (evt_destroy inclui recém-derrotados)
	const enemyFilter =
		event === "evt_destroy" || event === "evt_kill"
			? (e: { status: string }) =>
					e.status === "active" || e.status === "defeated"
			: (e: { status: string }) => e.status === "active";
	for (const enemy of state.activeEnemies.filter(enemyFilter)) {
		sources.push({ cardId: enemy.cardId, sourceEnemyId: enemy.id });
	}

	// 4. Sala atual
	if (state.currentRoom) {
		sources.push({ cardId: state.currentRoom.cardId });
	}

	// 5. Artefatos do grupo
	for (const artifact of state.groupArtifacts) {
		sources.push({
			cardId: artifact.cardId,
			sourceHeroId: artifact.carriedBy ?? undefined,
		});
	}

	return sources;
}

// Coleta todas as habilidades "em jogo" para o evento dado.
function collectActiveSkills(
	state: GameState,
	event: EventName,
): ActiveSkill[] {
	const active: ActiveSkill[] = [];

	for (const { cardId, sourceHeroId, sourceEnemyId } of inPlaySources(
		state,
		event,
	)) {
		for (const { def, ref } of cardSkills(cardId)) {
			if (ref.requiresAwakening && state.despertar !== 4) continue;
			if (def.operate_type !== "op_triggered") continue;
			if (def.trigger?.event !== event) continue;
			active.push({ definition: def, ref, sourceHeroId, sourceEnemyId });
		}
	}

	return active;
}

export function fireTrigger(
	state: GameState,
	event: EventName,
	ctx: SkillContext,
): GameState {
	const skills = collectActiveSkills(state, event);
	let current = state;

	for (const skill of skills) {
		// Hero-owned skills on evt_attack_declared are self-only
		if (
			event === "evt_attack_declared" &&
			skill.sourceHeroId &&
			ctx.sourceHeroId &&
			skill.sourceHeroId !== ctx.sourceHeroId
		)
			continue;
		// Enemy skills on evt_attack_declared fire only vs attacker
		if (
			event === "evt_attack_declared" &&
			skill.sourceEnemyId &&
			ctx.sourceEnemyId &&
			skill.sourceEnemyId !== ctx.sourceEnemyId
		)
			continue;

		if (!guardPassed(current, skill.definition, skill.sourceHeroId)) continue;

		const resolvedCtx: SkillContext = {
			...ctx,
			triggeredBy: event,
			sourceHeroId: skill.sourceHeroId ?? ctx.sourceHeroId,
			sourceEnemyId: skill.sourceEnemyId ?? ctx.sourceEnemyId,
			skillId: skill.definition.id,
			value: skill.ref.params?.value ?? null,
		};

		const params: Record<string, unknown> = {
			...(skill.definition.params ?? {}),
			...(skill.ref.params ?? {}),
		};

		// Avaliar def.conditions (Lote B): todas devem ser satisfeitas (AND implícito)
		if (skill.definition.conditions && skill.definition.conditions.length > 0) {
			const evalCtx = buildScriptCtx(current, resolvedCtx, params);
			const conditionsMet = skill.definition.conditions.every((c) =>
				resolveCondition(c, evalCtx),
			);
			if (!conditionsMet) continue;
		}

		if (skill.definition.effect) {
			// ── DSL path ─────────────────────────────────────────────────────────
			const evalCtx = buildScriptCtx(current, resolvedCtx, params);
			current = evaluate(skill.definition.effect, evalCtx);
		} else if (skill.definition.script) {
			// ── Script path ──────────────────────────────────────────────────────
			const fn = getScript(`${skill.definition.script}.run`);
			if (fn) {
				const scriptCtx = buildScriptCtx(current, resolvedCtx, params);
				current = fn(scriptCtx);
			}
		}
		// Sem effect nem script: skill sem implementação, ignorada silenciosamente.

		current = markGuardUsed(current, skill.definition, skill.sourceHeroId);
	}

	return current;
}

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

import { getCardByName } from "../data/cards";
import type { SkillRef } from "../data/cardTypes";
import type {
	SkillContext,
	SkillDefinition,
	TriggerName,
} from "../data/skillTypes";
import { buildScriptCtx } from "../scripts/context";
import { getScript } from "../scripts/registry";
import type { GameState } from "../state/gameState";
import { evaluate } from "./dsl/evaluate";
import { cardSkills } from "./lookup";
import { getHandler } from "./registry";

interface ActiveSkill {
	definition: SkillDefinition;
	ref: SkillRef;
	sourceHeroId?: string;
	sourceEnemyId?: string;
}

// Parseia trigger composto — separa guard e base trigger.
// Ex: "once_per_game_after_any_roll" → { guard: "once_per_game", base: "after_roll" }
export function parseTrigger(trigger: TriggerName): {
	guard: string | null;
	base: string;
} {
	const guards = [
		"once_per_game",
		"once_per_room",
		"once_per_combat",
		"once_per_round",
	];
	for (const g of guards) {
		if (trigger === g) return { guard: g, base: "on_use" };
		if (trigger.startsWith(`${g}_`)) {
			const rest = trigger.slice(g.length + 1);
			const suffixMap: Record<string, string> = {
				after_any_roll: "after_roll",
				after_roll: "after_roll",
				on_damage_taken: "on_damage_taken",
				on_dungeon_discard: "on_dungeon_discard",
				on_targeted_by_effect: "on_targeted",
				on_targeted: "on_targeted",
				on_extra_dungeon_discard: "on_dungeon_discard",
				on_defeat_creature: "on_destroy_creature_with_attack",
				after_roll_vs_prey: "after_roll",
				on_use_furia_rubra: "on_use_furia_rubra",
				until_end_of_round: "on_use",
			};
			return { guard: g, base: suffixMap[rest] ?? rest };
		}
	}
	const triggerAliases: Record<string, string> = {
		combat: "before_attack",
		combat_against_self: "before_attack",
		combat_if_dungeon_red_or_purple: "combat_if_dungeon_red_or_purple",
		while_in_play: "while_in_play",
		on_destroyed: "on_destroyed",
	};
	if (triggerAliases[trigger])
		return { guard: null, base: triggerAliases[trigger] };
	return { guard: null, base: trigger };
}

export function guardPassed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	const { guard } = parseTrigger(skill.trigger);
	if (!guard) return true;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (guard === "once_per_game") return !state.oncePer?.game?.[key];
	if (guard === "once_per_room") return !state.combat?.oncePer?.room?.[key];
	if (guard === "once_per_combat") return !state.combat?.oncePer?.combat?.[key];
	if (guard === "once_per_round") return !state.combat?.oncePer?.round?.[key];
	return true;
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
	const { guard } = parseTrigger(skill.trigger);
	if (!guard) return state;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (guard === "once_per_game") {
		return {
			...state,
			oncePer: {
				...state.oncePer,
				game: { ...(state.oncePer?.game ?? {}), [key]: true },
			},
		};
	}
	if (
		(guard === "once_per_room" ||
			guard === "once_per_combat" ||
			guard === "once_per_round") &&
		state.combat
	) {
		const scope =
			guard === "once_per_round"
				? "round"
				: guard === "once_per_combat"
					? "combat"
					: "room";
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

function inPlaySources(state: GameState, trigger: TriggerName): InPlaySource[] {
	const sources: InPlaySource[] = [];

	// 1. Heróis ativos
	for (const hero of state.heroes.filter((h) => h.status === "active")) {
		const heroCard = getCardByName(hero.cardName);
		if (heroCard) sources.push({ cardId: heroCard.id, sourceHeroId: hero.id });

		// 2. Itens equipados pelo herói
		for (const itemName of Object.values(hero.activeItems)) {
			if (!itemName) continue;
			const itemCard = getCardByName(itemName);
			if (itemCard)
				sources.push({ cardId: itemCard.id, sourceHeroId: hero.id });
		}
	}

	// 3. Inimigos ativos (on_destroyed inclui recém-derrotados)
	const enemyFilter =
		trigger === "on_destroyed"
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

// Coleta todas as habilidades "em jogo" para o trigger dado.
function collectActiveSkills(
	state: GameState,
	trigger: TriggerName,
): ActiveSkill[] {
	const active: ActiveSkill[] = [];

	for (const { cardId, sourceHeroId, sourceEnemyId } of inPlaySources(
		state,
		trigger,
	)) {
		for (const { def, ref } of cardSkills(cardId)) {
			if (ref.requiresAwakening && state.despertar !== 4) continue;
			const { base } = parseTrigger(def.trigger);
			if (base !== trigger) continue;
			active.push({ definition: def, ref, sourceHeroId, sourceEnemyId });
		}
	}

	return active;
}

export function fireTrigger(
	state: GameState,
	trigger: TriggerName,
	ctx: SkillContext,
): GameState {
	const skills = collectActiveSkills(state, trigger);
	let current = state;

	for (const skill of skills) {
		// Hero-owned skills on before_attack are self-only: only fire for the attacking hero.
		if (
			trigger === "before_attack" &&
			skill.sourceHeroId &&
			ctx.sourceHeroId &&
			skill.sourceHeroId !== ctx.sourceHeroId
		)
			continue;
		// Enemy skills with combat_against_self only fire when the hero is attacking THAT enemy.
		if (
			trigger === "before_attack" &&
			skill.sourceEnemyId &&
			ctx.sourceEnemyId &&
			skill.sourceEnemyId !== ctx.sourceEnemyId
		)
			continue;

		if (!guardPassed(current, skill.definition, skill.sourceHeroId)) continue;

		const resolvedCtx: SkillContext = {
			...ctx,
			triggeredBy: trigger,
			sourceHeroId: skill.sourceHeroId ?? ctx.sourceHeroId,
			sourceEnemyId: skill.sourceEnemyId ?? ctx.sourceEnemyId,
			skillId: skill.definition.id,
			value: skill.ref.params?.value ?? null,
		};

		// Normaliza valor para params: slash-pair "X/Y" → value = X (número)
		const rawValue = skill.ref.params?.value ?? null;
		const numericValue: number | string | null =
			typeof rawValue === "string" && rawValue.includes("/")
				? Number(rawValue.split("/")[0]) || 0
				: rawValue;
		const params: Record<string, unknown> = {
			...(skill.definition.params ?? {}),
			...(skill.ref.params ?? {}),
			value: numericValue,
		};

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
		} else {
			// ── Handler legado ────────────────────────────────────────────────────
			const handler = getHandler(skill.definition.type ?? "noop");
			if (!handler) continue;
			current = handler(current, resolvedCtx, rawValue);
		}

		current = markGuardUsed(current, skill.definition, skill.sourceHeroId);
	}

	return current;
}

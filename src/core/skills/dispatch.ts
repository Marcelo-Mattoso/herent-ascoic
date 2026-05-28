// Engine de dispatch de habilidades.
// fireTrigger(state, trigger, ctx) percorre todas as habilidades "em jogo",
// filtra por trigger, e executa o handler registrado para cada type.
//
// Ordem de resolução (quando há múltiplos handlers para o mesmo trigger):
//   1. Heróis ativos (na ordem em state.heroes)
//   2. Itens equipados pelos heróis (weapon → armor → utility → special)
//   3. Inimigos ativos (na ordem em state.activeEnemies)
//   4. Sala atual
//   5. Artefatos do grupo
// Se dois handlers no mesmo nível conflitarem em balanceamento, adicionar
// `priority?: number` em SkillDefinition (menor = executa primeiro).

import type { SkillDefinition, SkillContext, TriggerName } from "../data/skillTypes";
import type { GameState } from "../state/gameState";
import { getHandler } from "./registry";
import { resolveSkillForById, resolveSkillValueById, resolveSkillFor, resolveSkillValue } from "./lookup";

interface ActiveSkill {
	definition: SkillDefinition;
	value: number | string | null;
	sourceHeroId?: string;
	sourceEnemyId?: string;
}

// Parseia trigger composto — separa guard e base trigger.
// Ex: "once_per_game_after_any_roll" → { guard: "once_per_game", base: "after_roll" }
export function parseTrigger(trigger: TriggerName): { guard: string | null; base: string } {
	const guards = ["once_per_game", "once_per_room", "once_per_combat", "once_per_round"];
	for (const g of guards) {
		if (trigger === g) return { guard: g, base: "on_use" };
		if (trigger.startsWith(`${g}_`)) {
			const rest = trigger.slice(g.length + 1);
			// Mapear sufixos para base triggers
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
	// Aliases: triggers do JSON que disparam via um trigger base já existente
	const triggerAliases: Record<string, string> = {
		combat: "before_attack", // Fio Mortal — item sempre ativo em combate
		combat_against_self: "before_attack", // Corpo Gelatinoso — penalidade ao atacar esta criatura
		combat_if_dungeon_red_or_purple: "combat_if_dungeon_red_or_purple", // disparado condicionalmente em combat.ts
		while_in_play: "while_in_play", // disparado em handleStartCombat
		on_destroyed: "on_destroyed", // disparado em handleResolveAttack ao matar inimigo
	};
	if (triggerAliases[trigger]) return { guard: null, base: triggerAliases[trigger] };
	return { guard: null, base: trigger };
}

function guardPassed(
	state: GameState,
	skill: SkillDefinition,
	sourceHeroId?: string,
): boolean {
	const { guard } = parseTrigger(skill.trigger);
	if (!guard) return true;

	const key = sourceHeroId ? `${skill.id}::${sourceHeroId}` : skill.id;

	if (guard === "once_per_game") {
		return !(state.oncePer?.game?.[key]);
	}
	if (guard === "once_per_room") {
		return !(state.combat?.oncePer?.room?.[key]);
	}
	if (guard === "once_per_combat") {
		return !(state.combat?.oncePer?.combat?.[key]);
	}
	if (guard === "once_per_round") {
		return !(state.combat?.oncePer?.round?.[key]);
	}
	return true;
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
	if ((guard === "once_per_room" || guard === "once_per_combat" || guard === "once_per_round") && state.combat) {
		const scope = guard === "once_per_round" ? "round" : guard === "once_per_combat" ? "combat" : "room";
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

// Coleta todas as habilidades "em jogo" para o trigger dado.
function collectActiveSkills(state: GameState, trigger: TriggerName): ActiveSkill[] {
	const active: ActiveSkill[] = [];

	// Heróis ativos — skill e power
	for (const hero of state.heroes.filter((h) => h.status === "active")) {
		for (const field of ["skill", "power"] as const) {
			const def = resolveSkillForById(hero.cardId, field);
			if (!def) continue;
			const { base } = parseTrigger(def.trigger);
			if (base !== trigger) continue;
			active.push({
				definition: def,
				value: resolveSkillValueById(hero.cardId, field),
				sourceHeroId: hero.id,
			});
		}
		// Itens equipados
		for (const itemName of Object.values(hero.activeItems)) {
			if (!itemName) continue;
			const def = resolveSkillFor(itemName, "effect");
			if (!def) continue;
			const { base } = parseTrigger(def.trigger);
			if (base !== trigger) continue;
			active.push({
				definition: def,
				value: resolveSkillValue(itemName, "effect"),
				sourceHeroId: hero.id,
			});
		}
	}

	// Inimigos ativos — effect e purpleEffect
	// on_destroyed também inclui inimigos recém-derrotados (status "defeated")
	const enemyFilter = trigger === "on_destroyed"
		? (e: { status: string }) => e.status === "active" || e.status === "defeated"
		: (e: { status: string }) => e.status === "active";
	for (const enemy of state.activeEnemies.filter(enemyFilter)) {
		for (const field of ["effect", "purpleEffect"] as const) {
				if (field === "purpleEffect" && state.despertar !== 4) continue;
				const def = resolveSkillForById(enemy.cardId, field);
			if (!def) continue;
			const { base } = parseTrigger(def.trigger);
			if (base !== trigger) continue;
			active.push({
				definition: def,
				value: resolveSkillValueById(enemy.cardId, field),
				sourceEnemyId: enemy.id,
			});
		}
	}

	// Sala atual
	if (state.currentRoom) {
		const def = resolveSkillForById(state.currentRoom.cardId, "effect");
		if (def) {
			const { base } = parseTrigger(def.trigger);
			if (base === trigger) {
				active.push({ definition: def, value: resolveSkillValueById(state.currentRoom.cardId, "effect") });
			}
		}
	}

	// Artefatos do grupo
	for (const artifact of state.groupArtifacts) {
		const def = resolveSkillForById(artifact.cardId, "effect");
		if (!def) continue;
		const { base } = parseTrigger(def.trigger);
		if (base !== trigger) continue;
		const bearerHeroId = artifact.carriedBy ?? undefined;
		active.push({
			definition: def,
			value: resolveSkillValueById(artifact.cardId, "effect"),
			sourceHeroId: bearerHeroId,
		});
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

		const handler = getHandler(skill.definition.type);
		if (!handler) continue;

		const resolvedCtx: SkillContext = {
			...ctx,
			triggeredBy: trigger,
			sourceHeroId: skill.sourceHeroId ?? ctx.sourceHeroId,
			sourceEnemyId: skill.sourceEnemyId ?? ctx.sourceEnemyId,
			skillId: skill.definition.id,
			value: skill.value,
		};

		current = handler(current, resolvedCtx, skill.value);
		current = markGuardUsed(current, skill.definition, skill.sourceHeroId);
	}

	return current;
}

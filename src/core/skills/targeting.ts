// Resolve o target de uma habilidade para ids concretos no estado atual.
// Targets que exigem escolha do jogador retornam { kind: "needs_selection" }.

import { getCardName } from "../data/cardLocale";
import type {
	SkillContext,
	SkillDefinition,
	TargetCandidate,
	TargetResolution,
	TargetSpec,
} from "../data/skillTypes";
import type { GameState } from "../state/gameState";

export type ManualSkillTargetResolution =
	| {
			readonly kind: "ready";
			readonly targetIds: readonly string[];
	  }
	| {
			readonly kind: "needs_selection";
			readonly prompt: string;
			readonly candidates: readonly TargetCandidate[];
	  }
	| { readonly kind: "unavailable"; readonly reason: string };

function effectUsesExplicitTarget(effect: unknown): boolean {
	if (Array.isArray(effect)) return effect.some(effectUsesExplicitTarget);
	if (!effect || typeof effect !== "object") return false;
	for (const value of Object.values(effect)) {
		if (value === "$target") return true;
		if (effectUsesExplicitTarget(value)) return true;
	}
	return false;
}

function manualSkillNeedsTarget(def: SkillDefinition): boolean {
	if (def.script) {
		return def.target_type === "tgt_enemy" || def.target_type === "tgt_target";
	}
	if (def.target_type === "tgt_self") return false;
	if (def.affect_scope === "scp_none" || def.target_type === "tgt_none") {
		return false;
	}
	return effectUsesExplicitTarget(def.effect ?? []);
}

function activeHeroCandidates(
	state: GameState,
	sourceId: string,
	includeSource: boolean,
): TargetCandidate[] {
	return state.heroes
		.filter((hero) => hero.status === "active")
		.filter((hero) => includeSource || hero.id !== sourceId)
		.map((hero) => ({
			kind: "hero" as const,
			id: hero.id,
			label: getCardName(hero.cardId),
		}));
}

function activeEnemyCandidates(state: GameState): TargetCandidate[] {
	return state.activeEnemies
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => ({
			kind: "enemy" as const,
			id: enemy.id,
			label: getCardName(enemy.cardId),
		}));
}

function manualTargetCandidates(
	state: GameState,
	def: SkillDefinition,
	sourceId: string,
): TargetCandidate[] {
	if (
		def.target_type === "tgt_enemy" ||
		def.affect_object === "obj_not_friend"
	) {
		return activeEnemyCandidates(state);
	}
	return activeHeroCandidates(
		state,
		sourceId,
		def.target_type !== "tgt_others",
	);
}

function filterAllowedTargetIds(
	state: GameState,
	def: SkillDefinition,
	sourceId: string,
	targetIds: readonly string[],
): readonly string[] {
	if (def.target_type === "tgt_self") {
		return targetIds.filter((id) => id === sourceId);
	}
	if (def.affect_scope === "scp_party_full") {
		const activeHeroIds = new Set(
			state.heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		);
		return targetIds.filter((id) => activeHeroIds.has(id));
	}
	if (def.affect_scope === "scp_dead_party") {
		const defeatedHeroIds = new Set(
			state.defeatedHeroes.map((hero) => hero.id),
		);
		return targetIds.filter((id) => defeatedHeroIds.has(id));
	}
	if (!manualSkillNeedsTarget(def)) {
		return [];
	}
	const validIds = new Set(
		manualTargetCandidates(state, def, sourceId).map(
			(candidate) => candidate.id,
		),
	);
	return targetIds.filter((id) => validIds.has(id));
}

export function resolveManualSkillTarget(
	state: GameState,
	def: SkillDefinition,
	sourceId: string,
	targetIds?: readonly string[],
): ManualSkillTargetResolution {
	if (targetIds && targetIds.length > 0) {
		const valid = filterAllowedTargetIds(state, def, sourceId, targetIds);
		return valid.length > 0
			? { kind: "ready", targetIds: valid }
			: { kind: "unavailable", reason: "Alvo inválido." };
	}

	if (def.target_type === "tgt_self") {
		return { kind: "ready", targetIds: [sourceId] };
	}

	if (def.affect_scope === "scp_party_full") {
		return {
			kind: "ready",
			targetIds: state.heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		};
	}

	if (def.affect_scope === "scp_dead_party") {
		return {
			kind: "ready",
			targetIds: state.defeatedHeroes.map((hero) => hero.id),
		};
	}

	if (!manualSkillNeedsTarget(def)) {
		return { kind: "ready", targetIds: [] };
	}

	const candidates = manualTargetCandidates(state, def, sourceId);

	if (candidates.length === 0) {
		return { kind: "unavailable", reason: "Nenhum alvo válido disponível." };
	}

	if (candidates.length === 1) {
		return { kind: "ready", targetIds: [candidates[0]!.id] };
	}

	return {
		kind: "needs_selection",
		prompt:
			candidates[0]?.kind === "enemy"
				? "Escolha o inimigo alvo."
				: "Escolha o herói alvo.",
		candidates,
	};
}

export function resolveTarget(
	state: GameState,
	target: TargetSpec,
	ctx: SkillContext,
): TargetResolution {
	switch (target) {
		case "self": {
			const id = ctx.sourceHeroId ?? ctx.sourceEnemyId;
			if (!id) return { kind: "none" };
			if (ctx.sourceHeroId) return { kind: "resolved", heroIds: [id] };
			return { kind: "resolved", enemyIds: [id] };
		}

		case "hero": {
			// Se o contexto já especifica um alvo, usa-o; senão pede seleção.
			if (ctx.sourceHeroId)
				return { kind: "resolved", heroIds: [ctx.sourceHeroId] };
			const activeHeroes = state.heroes.filter((h) => h.status === "active");
			if (activeHeroes.length === 1)
				return { kind: "resolved", heroIds: [activeHeroes[0]!.id] };
			return {
				kind: "needs_selection",
				candidates: activeHeroes.map<TargetCandidate>((h) => ({
					kind: "hero",
					id: h.id,
					label: getCardName(h.cardId),
				})),
			};
		}

		case "heroes": {
			const ids = state.heroes
				.filter((h) => h.status === "active")
				.map((h) => h.id);
			return { kind: "resolved", heroIds: ids };
		}

		case "hero_or_ally":
		case "hero_or_ally_creature": {
			const candidates: TargetCandidate[] = state.heroes
				.filter((h) => h.status === "active")
				.map<TargetCandidate>((h) => ({
					kind: "hero",
					id: h.id,
					label: getCardName(h.cardId),
				}));
			if (candidates.length === 1)
				return { kind: "resolved", heroIds: [candidates[0]!.id] };
			return { kind: "needs_selection", candidates };
		}

		case "heroes_or_self_next_attack": {
			// Escolha do jogador: cure heroes OU buff próximo ataque
			const activeHeroes = state.heroes.filter((h) => h.status === "active");
			return {
				kind: "needs_selection",
				candidates: activeHeroes.map<TargetCandidate>((h) => ({
					kind: "hero",
					id: h.id,
					label: getCardName(h.cardId),
				})),
			};
		}

		case "creature_in_room":
		case "creature_in_play":
		case "chosen_enemy": {
			const activeEnemies = state.activeEnemies.filter(
				(e) => e.status === "active",
			);
			if (activeEnemies.length === 1)
				return { kind: "resolved", enemyIds: [activeEnemies[0]!.id] };
			return {
				kind: "needs_selection",
				candidates: activeEnemies.map<TargetCandidate>((e) => ({
					kind: "enemy",
					id: e.id,
					label: getCardName(e.cardId),
				})),
			};
		}

		case "ally_die":
		case "ally_or_enemy_die":
		case "blue_die_and_self":
		case "die_with_value_1": {
			// Dados individuais — a engine emite needs_selection com dieIndices.
			// Por ora retornamos needs_selection sem candidatos concretos;
			// a UI trata via fase SKILL_TARGETING.
			return { kind: "needs_selection", candidates: [] };
		}

		case "dungeon":
		case "group":
		case "item_deck": {
			// Alvos de zona/recurso — sem seleção de entidade.
			return { kind: "resolved" };
		}

		case "all_heroes": {
			const ids = state.heroes.map((h) => h.id);
			return { kind: "resolved", heroIds: ids };
		}

		case "lowest_life_hero": {
			const active = state.heroes.filter((h) => h.status === "active");
			if (active.length === 0) return { kind: "none" };
			const lowest = active.reduce((a, b) =>
				a.currentLife <= b.currentLife ? a : b,
			);
			return { kind: "resolved", heroIds: [lowest.id] };
		}

		default:
			return { kind: "none" };
	}
}

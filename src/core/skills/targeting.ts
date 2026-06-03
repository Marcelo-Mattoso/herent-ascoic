// Resolve o target de uma habilidade para ids concretos no estado atual.
// Targets que exigem escolha do jogador retornam { kind: "needs_selection" }.

import type {
	SkillContext,
	TargetCandidate,
	TargetResolution,
	TargetSpec,
} from "../data/skillTypes";
import { getCardById } from "../data/cards";
import type { GameState } from "../state/gameState";

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
					label: getCardById(h.cardId)?.name ?? h.cardId,
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
					label: getCardById(h.cardId)?.name ?? h.cardId,
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
					label: getCardById(h.cardId)?.name ?? h.cardId,
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
					label: getCardById(e.cardId)?.name ?? e.cardId,
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

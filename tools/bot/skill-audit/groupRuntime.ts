/**
 * Validação independente de grupos: projeção de todas as habilidades dos
 * 12 heróis em composições rotativas + interação de habilidades distintas.
 * Não confundir smoke de grupo com cobertura total de efeitos cooperativos.
 */
import { getCardsByType } from "@/core/data/cards";
import { cardAbilityGrants } from "@/core/data/abilities";
import { createInitialGameState } from "@/core/state/gameState";
import { heroesOf, pendingSkillTargetOf } from "@/core/state/access";
import { reducer } from "@/core/reducer";
import { playerView } from "@/core/projection/playerView";
import { gameOf } from "@/engine/state";
import { auditEngine, combat } from "./runtime";

export interface GroupProjectionResult {
	readonly id: string;
	readonly partySize: number;
	readonly heroCardIds: readonly string[];
	readonly seed: number;
	readonly status: "PASS" | "FAIL";
	readonly detail: string;
}

export interface GroupCombatResult {
	readonly partySize: number;
	readonly heroCardIds: readonly string[];
	readonly abilityIds: readonly string[];
	readonly status: "PASS" | "FAIL";
	readonly detail: string;
}

export const GROUP_HERO_ORDER = [
	"hero_broken_veil_hunter", "hero_crimson_barbarian",
	"hero_eternal_rest_cleric", "hero_broken_bastion_warrior",
] as const;

function ensure(condition: unknown, detail: string): asserts condition {
	if (!condition) throw new Error(detail);
}

export function groupHeroOrder(heroIds: readonly string[]): string[] {
	return [...GROUP_HERO_ORDER.filter((id) => heroIds.includes(id)),
		...heroIds.filter((id) => !GROUP_HERO_ORDER.includes(id as typeof GROUP_HERO_ORDER[number]))];
}

export function runGroupProjectionScenarios(): GroupProjectionResult[] {
	const ids = getCardsByType("hero").map((hero) => hero.id);
	const results: GroupProjectionResult[] = [];
	for (const size of [1, 2, 3, 4]) {
		if (ids.length < size) continue;
		for (let offset = 0; offset < ids.length; offset++) {
			const heroCardIds = Array.from({ length: size }, (_, index) =>
				ids[(offset + index) % ids.length]!);
			const seed = 900 + offset + size * 100;
			try {
				const started = reducer(auditEngine, createInitialGameState({ heroCardIds }), {
					type: "START_GAME", payload: { heroCardIds, seed },
				});
				const heroes = heroesOf(started);
				ensure(heroes.length === size && heroes.every((hero) => hero.status === "active"),
					"Grupo não iniciou com todos os heróis ativos");
				const view = playerView(auditEngine, started);
				for (const hero of heroes) {
					const projected = view.abilityActionsByHero[hero.id] ?? [];
					for (const grant of cardAbilityGrants(hero.cardId)) {
						if (grant.activation.kind !== "manual" && grant.activation.kind !== "event") continue;
						ensure(projected.some((ability) => ability.abilityId === grant.abilityId),
							hero.cardId + "/" + grant.abilityId + ": grant não apareceu na interface");
					}
				}
				results.push({ id: `party-projection-${size}-${offset}`, partySize: size,
					heroCardIds, seed, status: "PASS", detail: "Grupo iniciou e expôs grants manuais/evento" });
			} catch (error) {
				results.push({ id: `party-projection-${size}-${offset}`, partySize: size,
					heroCardIds, seed, status: "FAIL",
					detail: error instanceof Error ? error.message : String(error) });
			}
		}
	}
	return results;
}

/** Um combo real de dois heróis, expandido para grupos de 3 e 4. */
export function runGroupCombatScenarios(): GroupCombatResult[] {
	return ([2, 3, 4] as const).map((partySize): GroupCombatResult => {
		const heroCardIds = GROUP_HERO_ORDER.slice(0, partySize);
		const abilityIds = ["skill_prey_mark", "skill_crimson_fury"];
		try {
			let state = combat(heroCardIds);
			const hunter = heroesOf(state).find((hero) => hero.cardId === GROUP_HERO_ORDER[0]);
			const barbarian = heroesOf(state).find((hero) => hero.cardId === GROUP_HERO_ORDER[1]);
			ensure(hunter && barbarian, "Caçador e Bárbaro não iniciaram juntos");
			state = reducer(auditEngine, state, { type: "USE_SKILL", payload: {
				skillId: "skill_prey_mark", sourceId: hunter.id,
			} });
			ensure(pendingSkillTargetOf(state)?.candidates.some((enemy) => enemy.id === "audit-enemy"),
				"Marca da Presa não abriu seleção de inimigo no grupo");
			state = reducer(auditEngine, state, { type: "SELECT_SKILL_TARGET", payload: {
				targetId: "audit-enemy",
			} });
			ensure(gameOf(state).combat?.preyByHero[hunter.id] === "audit-enemy",
				"Marca da Presa foi perdida antes da ação do segundo herói");
			const life = heroesOf(state).find((hero) => hero.id === barbarian.id)!.currentLife;
			state = reducer(auditEngine, state, { type: "USE_SKILL", payload: {
				skillId: "skill_crimson_fury", sourceId: barbarian.id,
			} });
			ensure(Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) =>
				entry.sourceHeroId === barbarian.id && entry.abilityId === "skill_crimson_fury"),
				"Fúria foi preparada fora do Bárbaro");
			state = reducer(auditEngine, state, { type: "CHOOSE_TARGET", payload: {
				heroId: barbarian.id, enemyId: "audit-enemy",
			} });
			state = reducer(auditEngine, state, { type: "ROLL_DICE" });
			ensure(heroesOf(state).find((hero) => hero.id === barbarian.id)?.currentLife === life - 2,
				"Fúria não aplicou custo ao herói correto");
			ensure(!gameOf(state).combat?.heroesActed.includes(hunter.id),
				"Ataque do Bárbaro bloqueou a ação do Caçador");
			ensure(heroesOf(state).length === partySize,
				"Heróis desapareceram após habilidades simultâneas");
			return { partySize, heroCardIds, abilityIds, status: "PASS",
				detail: "Marcação + Fúria em heróis diferentes, custo isolado e ação do aliado preservada" };
		} catch (error) {
			return { partySize, heroCardIds, abilityIds, status: "FAIL",
				detail: error instanceof Error ? error.message : String(error) };
		}
	});
}

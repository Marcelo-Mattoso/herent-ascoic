import { HERO_ABILITY_IDS } from "../data/heroAbilityIds";
import type { GameState } from "../state/gameState";
import { cardById, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { gameOf, withGame } from "../../engine/state";



export interface PreparedAbility {
	readonly key: string;
	readonly sourceKind: "hero" | "item" | "artifact";
	readonly sourceHeroId: string;
	readonly sourceCardId: string;
	readonly abilityId: string;
	readonly grantId?: string;
	readonly event: import("../skills/dsl/types").EventName;
	readonly targetIds?: readonly string[];
	readonly roundPrepared?: number;
}

export function preparedAbilityKey(
	sourceKind: PreparedAbility["sourceKind"],
	sourceHeroId: string,
	sourceCardId: string,
	abilityId: string,
	grantId?: string,
): string {
	return [sourceKind, sourceHeroId, sourceCardId, grantId ?? abilityId].join(":");
}

export function isAbilityPrepared(state: GameState, key: string): boolean {
	return Boolean(gameOf(state).preparedAbilities?.[key]);
}

export function removePreparedAbility(state: GameState, key: string): GameState {
	if (!gameOf(state).preparedAbilities?.[key]) return state;
	const { [key]: _removed, ...remaining } = gameOf(state).preparedAbilities!;
	return withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: remaining }));
}

export function togglePreparedAbility(
	state: GameState,
	prepared: PreparedAbility,
): GameState {
	if (isAbilityPrepared(state, prepared.key)) {
		return removePreparedAbility(state, prepared.key);
	}
	return withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: {
			...gameOf(state).preparedAbilities,
			[prepared.key]: prepared,
		} }));
}

/** Remove arms whose source, target, or combat opportunity disappeared. */
const COMBAT_EVENTS = new Set([
	"evt_attack_declared", "evt_roll", "evt_hit", "evt_damage_dealt",
	"evt_damage_taken", "evt_would_be_destroyed", "evt_destroy", "evt_kill",
	"evt_combat_start", "evt_combat_end", "evt_round_start", "evt_round_end",
	"evt_targeted", "evt_leave_play",
]);

export function prunePreparedAbilities(engine: GameEngine, state: GameState, previous?: GameState): GameState {
	const prepared = gameOf(state).preparedAbilities;
	if (!prepared || Object.keys(prepared).length === 0) return state;
	if (previous && gameOf(previous).currentRoom?.cardId !== gameOf(state).currentRoom?.cardId)
		return withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: {} }));
	const valid = Object.fromEntries(
		Object.entries(prepared).filter(([, entry]) => {
			if (previous && gameOf(previous).combat && !gameOf(state).combat && COMBAT_EVENTS.has(entry.event)) return false;
			const hero = gameOf(state).heroes.find(
				(candidate) => candidate.id === entry.sourceHeroId && candidate.status === "active",
			);
			if (!hero) return false;
			if (entry.abilityId === HERO_ABILITY_IDS.power_supreme_rift_rune && entry.roundPrepared !== gameOf(state).combat?.round) return false;
			if (gameOf(state).combat?.heroesActed.includes(hero.id) &&
				![HERO_ABILITY_IDS.power_supreme_rift_rune, HERO_ABILITY_IDS.skill_preserved_path].some((allowedId) => allowedId === entry.abilityId)) return false;
			if (entry.sourceKind === "hero" && hero.cardId !== entry.sourceCardId) return false;
			if (
				entry.sourceKind === "item" &&
				!Object.values(hero.activeItems).includes(entry.sourceCardId)
			) return false;
			if (
				entry.sourceKind === "artifact" &&
				!gameOf(state).groupArtifacts.some(
					(artifact) => artifact.cardId === entry.sourceCardId &&
						(!artifact.carriedBy || artifact.carriedBy === hero.id),
				)
			) return false;
			if (
				entry.targetIds?.some(
					(id) => !gameOf(state).heroes.some((candidate) => candidate.id === id && candidate.status === "active") &&
						!gameOf(state).activeEnemies.some((candidate) => candidate.id === id && candidate.status === "active"),
				)
			) return false;
			const card = cardById(engine, entry.sourceCardId);
			return entry.grantId
				? Boolean(card?.grants?.some((grant) => grant.id === entry.grantId && grant.abilityId === entry.abilityId))
				: skillsOf(engine, entry.sourceCardId).some(({ def }) => def.id === entry.abilityId);
		}),
	);
	if (Object.keys(valid).length === Object.keys(prepared).length) return state;
	return withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: valid }));
}

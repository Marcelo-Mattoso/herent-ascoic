import type { GameState } from "../state/gameState";
import { getCardById } from "../data/cards";
import { cardSkills } from "../skills/lookup";

export interface PreparedAbility {
	readonly key: string;
	readonly sourceKind: "hero" | "item" | "artifact";
	readonly sourceHeroId: string;
	readonly sourceCardId: string;
	readonly abilityId: string;
	readonly grantId?: string;
	readonly event: import("../skills/dsl/types").EventName;
	readonly targetIds?: readonly string[];
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
	return Boolean(state.preparedAbilities?.[key]);
}

export function removePreparedAbility(state: GameState, key: string): GameState {
	if (!state.preparedAbilities?.[key]) return state;
	const { [key]: _removed, ...remaining } = state.preparedAbilities;
	return {
		...state,
		preparedAbilities: remaining,
	};
}

export function togglePreparedAbility(
	state: GameState,
	prepared: PreparedAbility,
): GameState {
	if (isAbilityPrepared(state, prepared.key)) {
		return removePreparedAbility(state, prepared.key);
	}
	return {
		...state,
		preparedAbilities: {
			...state.preparedAbilities,
			[prepared.key]: prepared,
		},
	};
}

/** Remove arms whose source, target, or combat opportunity disappeared. */
const COMBAT_EVENTS = new Set([
	"evt_attack_declared", "evt_roll", "evt_hit", "evt_damage_dealt",
	"evt_damage_taken", "evt_would_be_destroyed", "evt_destroy", "evt_kill",
	"evt_combat_start", "evt_combat_end", "evt_round_start", "evt_round_end",
	"evt_targeted", "evt_leave_play",
]);

export function prunePreparedAbilities(state: GameState, previous?: GameState): GameState {
	const prepared = state.preparedAbilities;
	if (!prepared || Object.keys(prepared).length === 0) return state;
	if (previous && previous.currentRoom?.cardId !== state.currentRoom?.cardId)
		return { ...state, preparedAbilities: {} };
	const valid = Object.fromEntries(
		Object.entries(prepared).filter(([, entry]) => {
			if (previous?.combat && !state.combat && COMBAT_EVENTS.has(entry.event)) return false;
			const hero = state.heroes.find(
				(candidate) => candidate.id === entry.sourceHeroId && candidate.status === "active",
			);
			if (!hero || state.combat?.heroesActed.includes(hero.id)) return false;
			if (entry.sourceKind === "hero" && hero.cardId !== entry.sourceCardId) return false;
			if (
				entry.sourceKind === "item" &&
				!Object.values(hero.activeItems).includes(entry.sourceCardId)
			) return false;
			if (
				entry.sourceKind === "artifact" &&
				!state.groupArtifacts.some(
					(artifact) => artifact.cardId === entry.sourceCardId &&
						(!artifact.carriedBy || artifact.carriedBy === hero.id),
				)
			) return false;
			if (
				entry.targetIds?.some(
					(id) => !state.heroes.some((candidate) => candidate.id === id && candidate.status === "active") &&
						!state.activeEnemies.some((candidate) => candidate.id === id && candidate.status === "active"),
				)
			) return false;
			const card = getCardById(entry.sourceCardId);
			return entry.grantId
				? Boolean(card?.grants?.some((grant) => grant.id === entry.grantId && grant.abilityId === entry.abilityId))
				: cardSkills(entry.sourceCardId).some(({ def }) => def.id === entry.abilityId);
		}),
	);
	if (Object.keys(valid).length === Object.keys(prepared).length) return state;
	return { ...state, preparedAbilities: valid };
}

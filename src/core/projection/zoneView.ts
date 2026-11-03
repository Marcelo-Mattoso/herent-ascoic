import type { ProjectedEngine, ProjectOptions } from "../../engine/projection";
import type { Zone, ZoneVisibility } from "../../engine/state";
import { PARTY_PLAYER } from "../choices";
import { pilesOf, projectedFor } from "../state/access";
import type { GameState } from "../state/gameState";
import { type DeckName, type Pile, zoneName } from "../state/zones";

const COUNT_ONLY = new Set([
	zoneName("dungeonDeck", "available"),
	zoneName("enemyDeck", "available"),
]);
const SHOP_VISIBLE = new Set([
	zoneName("itemDeck", "available"),
	zoneName("artifactDeck", "available"),
]);

export function partyZoneVisibility(zone: Zone): ZoneVisibility {
	if (SHOP_VISIBLE.has(zone.id)) return "public";
	if (COUNT_ONLY.has(zone.id)) return "count";
	return zone.visibility;
}

const PARTY_OPTIONS: ProjectOptions = { zoneVisibility: partyZoneVisibility };

export function partyProjection(state: GameState): ProjectedEngine {
	return projectedFor(state, PARTY_PLAYER, PARTY_OPTIONS);
}

export function pileCount(state: GameState, deck: DeckName, pile: Pile): number {
	return partyProjection(state).zones[zoneName(deck, pile)]?.count ?? 0;
}

export function pileCards(
	state: GameState,
	deck: DeckName,
	pile: Pile,
): readonly string[] {
	const zone = partyProjection(state).zones[zoneName(deck, pile)];
	if (!zone?.cards) return [];
	return pilesOf(state, deck)[pile];
}

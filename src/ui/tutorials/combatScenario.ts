import type { Action } from "@/core/actions/types";
import type { TutorialEntryContext } from "./registry";

import {
	COMBAT_DEFAULT_HERO,
	COMBAT_FINISHING_SEED,
	COMBAT_OPENING_SEED,
} from "@/data/scenarios/seeds";

export { COMBAT_DEFAULT_HERO, COMBAT_FINISHING_SEED, COMBAT_OPENING_SEED };

export function canReuseCombatBoard({ view }: TutorialEntryContext): boolean {
	return (
		view.status === "COMBAT_START" &&
		view.heroes.filter((hero) => hero.status === "active").length === 1 &&
		view.enemies.filter((enemy) => enemy.status === "active").length === 1 &&
		!!view.currentRoom &&
		!view.pendingSkillChoice &&
		!view.pendingSkillTarget &&
		!view.pendingTriggerInterrupt
	);
}

function startEncounter(heroCardId: string, seed: number): readonly Action[] {
	return [
		{
			type: "START_GAME",
			payload: {
				heroCardIds: [heroCardId],
				difficulty: "normal",
				mode: "cooperative",
				seed,
			},
		},
		{ type: "RESOLVE_ROOM_EFFECT" },
		{ type: "SPAWN_ENEMIES" },
		{ type: "START_COMBAT" },
	];
}

export function prepareCombatEntry(
	context: TutorialEntryContext,
): readonly Action[] {
	if (canReuseCombatBoard(context)) return [{ type: "START_COMBAT" }];
	return startEncounter(
		context.selectedHeroCardIds[0] ?? COMBAT_DEFAULT_HERO,
		COMBAT_OPENING_SEED,
	);
}

export function prepareCombatCheckpoint(heroCardId: string): readonly Action[] {
	return startEncounter(heroCardId, COMBAT_FINISHING_SEED);
}

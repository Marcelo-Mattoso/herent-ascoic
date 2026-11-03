import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { addComponent } from "../../ecs/world";
import type {
	Duration,
	ModifierComponent,
	TriggerComponent,
} from "../../ecs/types";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import { reducer } from "../index";
import { gameOf, withGame } from "../../../engine/state";

const HERO_CARD = "hero_crimson_barbarian";

function modifier(source: string, duration: Duration): ModifierComponent {
	return {
		type: "modifier",
		target: "damage_dealt",
		operation: "add",
		value: 1,
		source,
		duration,
	};
}

function trigger(source: string, duration: Duration): TriggerComponent {
	return {
		type: "trigger",
		on: "RoomEntered",
		effect: { kind: "i_noop" },
		source,
		duration,
		priority: 0,
	};
}

function pausedForRestart(): GameState {
	const started = reducer(
		testEngine,
		createInitialGameState({ heroCardIds: [HERO_CARD] }),
		{
			type: "START_GAME",
			payload: {
				heroCardIds: [HERO_CARD],
				difficulty: "normal",
				seed: 1,
				bossCardId: testEngine.content.cardsOfType("boss")[0]!.id,
			},
		},
	);
	const hero = gameOf(started).heroes[0]!;
	let world = gameOf(started).world;
	for (const component of [
		modifier("perm_mod", { kind: "permanent" }),
		trigger("perm_trigger", { kind: "permanent" }),
		modifier("combat_mod", { kind: "this_combat" }),
		modifier("once_mod", { kind: "once" }),
	]) {
		world = addComponent(world, hero.id, component);
	}
	return withGame(started, (prevGame) => ({ ...prevGame, world, status: "DUNGEON_RESTART_PROMPT", heroes: [], fledHeroes: [{ ...hero, status: "fled" }] }));
}

function sourcesAfterRestart(): string[] {
	const state = pausedForRestart();
	const restarted = reducer(testEngine, state, {
		type: "RESTART_DUNGEON",
		payload: { keepEquipment: true },
	});
	const heroId = gameOf(restarted).heroes[0]!.id;
	return (gameOf(restarted).world.entities[heroId]?.components ?? [])
		.filter((c) => c.type === "modifier" || c.type === "trigger")
		.map((c) => (c as ModifierComponent).source)
		.sort();
}

describe("RESTART_DUNGEON recria o world (F7.5 item 6)", () => {
	it("mantém modificadores e gatilhos permanentes do herói e descarta os de combate", () => {
		expect(sourcesAfterRestart()).toEqual(["perm_mod", "perm_trigger"]);
	});
});

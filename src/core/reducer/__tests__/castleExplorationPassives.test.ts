import { describe, expect, it } from "vitest";
import { testEngine } from "../../__tests__/testEngine";
import { createInitialGameState } from "../../state/gameState";
import { deckOf, decksOf, heroesOf, pendingSkillChoiceOf, withDecks, worldOf } from "../../state/access";
import { createEmptyCombatState } from "../../state/combatState";
import { tickModifierDurations } from "../../ecs/world";
import { skillById } from "../../gameEngine";
import { gameOf, withGame } from "../../../engine/state";
import { handleStartGame } from "../setup";
import { resumeDungeonAdvance } from "../exploration";
import { handleSkillChoice } from "../responses";
import { handleStartCombat } from "../combat";
import { resolveSkillWindow } from "../../skills/resolveSkillWindow";

const BOSS = "boss_therion_infinite_horizon_king";
const EXPLORER = "hero_plains_wanderer";
const ROOM_A = "room_broken_castle_gate";
const ROOM_B = "room_cold_wind_corridor";

function startedWith(heroId: string) {
	return handleStartGame(testEngine,
		createInitialGameState({ heroCardIds: [heroId], bossCardId: BOSS }),
		{ heroCardIds: [heroId], bossCardId: BOSS, seed: 37, difficulty: "normal",
			deferInitialRoomReveal: true });
}

function readyToExplore(rooms: readonly string[]) {
	const started = startedWith(EXPLORER);
	const ready = withGame(started, (g) => ({
		...g, currentRoom: null, roomsCleared: 2, status: "XP_SPEND_PHASE" as const,
	}));
	return withDecks(ready, {
		...decksOf(ready),
		dungeonDeck: {
			...deckOf(ready, "dungeonDeck"),
			available: [...rooms], discarded: [], removed: [],
		},
	});
}

describe("Iluminar o Caminho / Castelo do Horizonte Infindo", () => {
	it("não pede escolha quando há apenas um caminho", () => {
		const state = resumeDungeonAdvance(testEngine, readyToExplore([ROOM_A, ROOM_B]), 1);
		expect(pendingSkillChoiceOf(state)).toBeUndefined();
		expect(gameOf(state).currentRoom?.cardId).toBeDefined();
		// A sala entrou no jogo sem o modal legado de olhar uma única carta.
		expect(gameOf(state).paths).toEqual([]);
	});

	it("só oferece caminhos distintos; duas cópias da mesma sala não geram escolha", () => {
		const state = resumeDungeonAdvance(testEngine, readyToExplore([ROOM_A, ROOM_A]), 2);
		expect(pendingSkillChoiceOf(state)).toBeUndefined();
		expect(gameOf(state).currentRoom?.cardId).toBe(ROOM_A);
	});

	it("escolhe uma das salas reveladas e descarta a outra pelo fluxo normal", () => {
		const state = resumeDungeonAdvance(testEngine, readyToExplore([ROOM_A, ROOM_B]), 2);
		const pending = pendingSkillChoiceOf(state);
		expect(pending?.kind).toBe("dungeon_path");
		expect(pending?.options).toHaveLength(2);
		const paths = gameOf(state).paths;
		expect(paths).toHaveLength(2);
		const next = handleSkillChoice(testEngine, state, {
			skillId: pending!.skillId, choice: pending!.options[1]!.id,
		});
		expect(gameOf(next).currentRoom?.cardId).toBe(paths[1]);
		expect(deckOf(next, "dungeonDeck").discarded).toContain(paths[0]);
		expect(pendingSkillChoiceOf(next)).toBeUndefined();
		expect(gameOf(next).paths).toEqual([]);
	});
});

describe("passivos automáticos dos heróis do Castelo", () => {
	it("Olhar do Poente soma +3 de Acerto no começo do combate e expira ao fim da rodada", () => {
		const skill = skillById(testEngine, "castle_skill_sunset_precision");
		expect(skill?.interrupt?.mode).toBe("auto");
		expect(skill?.effect).toEqual(expect.arrayContaining([expect.objectContaining({
			kind: "p_modifier", stat: "s_hit_bonus", value: 3,
			duration: { kind: "until_end_of_round" },
		})]));
		const base = startedWith("hero_sunset_spear");
		const state = withGame(base, (g) => ({
			...g, status: "COMBAT_START" as const, combat: createEmptyCombatState(),
		}));
		const started = handleStartCombat(testEngine, state);
		const heroId = heroesOf(started)[0]!.id;
		const bonuses = () => worldOf(started).entities[heroId]?.components.filter((c) =>
			c.type === "modifier" && c.target === "hit_bonus" && c.value === 3) ?? [];
		expect(bonuses()).toHaveLength(1);
		expect(bonuses()[0]).toMatchObject({ duration: { kind: "this_turn" } });
		const afterRound = tickModifierDurations(worldOf(started), "end_of_round");
		expect(afterRound.entities[heroId]?.components.some((c) =>
			c.type === "modifier" && c.target === "hit_bonus" && c.value === 3)).toBe(false);
	});

	it("Passo do Vento Seco reduz 2 uma única vez por sala, sem pedir confirmação", () => {
		const skill = skillById(testEngine, "castle_skill_dry_wind_step");
		expect(skill?.interrupt?.mode).toBe("auto");
		expect(skill?.cooldown).toMatchObject({ scope: "room", charges: 1 });
		expect(skill?.effect).toEqual(expect.arrayContaining([expect.objectContaining({
			kind: "p_modifier", stat: "s_damage_reduction", value: 2,
			duration: { kind: "once" },
		})]));
		const base = startedWith("hero_dry_wind_knight");
		const state = withGame(base, (g) => ({
			...g, status: "HERO_ACTION" as const, combat: createEmptyCombatState(),
		}));
		const heroId = heroesOf(state)[0]!.id;
		const request = {
			event: "evt_targeted" as const,
			ctx: { triggeredBy: "evt_targeted", targetHeroIds: [heroId], round: 0 },
		};
		const once = resolveSkillWindow(testEngine, state, request);
		const twice = resolveSkillWindow(testEngine, once, request);
		const reductions = (value: typeof once) =>
			worldOf(value).entities[heroId]?.components.filter((c) =>
				c.type === "modifier" && c.target === "damage_taken" && c.value === -2) ?? [];
		expect(reductions(once)).toHaveLength(1);
		expect(reductions(twice)).toHaveLength(1);
	});
});

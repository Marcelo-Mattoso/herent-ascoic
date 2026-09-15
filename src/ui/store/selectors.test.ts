import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer/index";
import type { EnemyState } from "@/core/state/enemyState";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";
import type { RoomState } from "@/core/state/roomState";
import { selectHeroCombatActions } from "./selectors";

const BARBARO = "hero_crimson_barbarian";
const CLERIGO = "hero_eternal_rest_cleric";
const LADINO = "hero_rift_rogue";

function buildCombatStartState(heroId: string): GameState {
	const base = createInitialGameState({ heroCardIds: [heroId] });
	const s = reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds: [heroId] },
	});

	const hero = s.heroes[0];
	if (!hero) throw new Error("no hero");

	const enemy: EnemyState = {
		id: "e1",
		cardId: "creature_deep_rift_rat",
		maxLife: 1,
		currentLife: 1,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: { xp: 1, reward_item: 1, reward_artifact: 0 },
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	const room: RoomState = {
		cardId: "room_dungeon_room",
		exits: 2,
		currentEnemies: 1,
		reward: 0,
		rewardType: "item",
		effect: "",
		xp: 1,
		status: "active",
	};

	return {
		...s,
		heroes: [{ ...hero, hitBonus: 100 }],
		currentRoom: room,
		activeEnemies: [enemy],
		status: "COMBAT_START",
	};
}

function buildSelectingTargetState(heroName: string): {
	state: GameState;
	heroId: string;
} {
	const base = buildCombatStartState(heroName);
	const afterStart = reducer(base, { type: "START_COMBAT" });
	const heroId = afterStart.heroes[0]!.id;
	const afterChoose = reducer(afterStart, {
		type: "CHOOSE_HERO_FOR_ROUND",
		payload: { heroId },
	});
	return { state: afterChoose, heroId };
}

describe("selectHeroCombatActions — selecting_target", () => {
	it("herói selecionado com inimigo ativo → pode atacar, passar e cancelar", () => {
		const { state, heroId } = buildSelectingTargetState(BARBARO);
		expect(state.combat?.phase).toBe("selecting_target");

		const actions = selectHeroCombatActions(state, heroId);
		expect(actions.canAttack).toBe(true);
		expect(actions.canPass).toBe(true);
		expect(actions.canCancel).toBe(true);
		expect(actions.canUsePower).toBe(false);
	});

	it("herói NÃO selecionado → todas as ações de alvo desabilitadas", () => {
		const { state } = buildSelectingTargetState(BARBARO);
		const outroId = "id-que-nao-existe";
		const actions = selectHeroCombatActions(state, outroId);
		expect(actions.canAttack).toBe(false);
		expect(actions.canPass).toBe(false);
		expect(actions.canCancel).toBe(false);
		expect(actions.canUsePower).toBe(false);
	});

	it("poder já usado → canUsePower false", () => {
		const { state, heroId } = buildSelectingTargetState(BARBARO);
		const withPowerUsed: GameState = {
			...state,
			combat: {
				...state.combat!,
				powersUsedThisRoom: { [heroId]: true },
			},
		};
		const actions = selectHeroCombatActions(withPowerUsed, heroId);
		expect(actions.canUsePower).toBe(false);
		expect(actions.canAttack).toBe(true);
	});

	it("Ladino das Fendas → skill.activatable false", () => {
		const { state, heroId } = buildSelectingTargetState(LADINO);
		const actions = selectHeroCombatActions(state, heroId);
		expect(actions.skill).not.toBeNull();
		expect(actions.skill?.activatable).toBe(false);
	});

	it("Clérigo → skill.activatable true; antes de usar alreadyUsed false", () => {
		const { state, heroId } = buildSelectingTargetState(CLERIGO);
		const actions = selectHeroCombatActions(state, heroId);
		expect(actions.skill).not.toBeNull();
		expect(actions.skill?.activatable).toBe(true);
		expect(actions.skill?.alreadyUsed).toBe(false);
	});

	it("canFlee apenas quando vida=1 e fleeBlocked não setado", () => {
		const { state, heroId } = buildSelectingTargetState(BARBARO);
		const hero = state.heroes[0]!;

		const comVidaAlta: GameState = {
			...state,
			heroes: [{ ...hero, currentLife: 5 }],
		};
		expect(selectHeroCombatActions(comVidaAlta, heroId).canFlee).toBe(false);

		const comVida1: GameState = {
			...state,
			heroes: [{ ...hero, currentLife: 1 }],
		};
		expect(selectHeroCombatActions(comVida1, heroId).canFlee).toBe(true);

		const bloqueado: GameState = {
			...comVida1,
			flags: { fleeBlocked: true },
		};
		expect(selectHeroCombatActions(bloqueado, heroId).canFlee).toBe(false);
	});
});

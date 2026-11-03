import { createHash } from "node:crypto";
import type { Action } from "@/core/actions/types";
import { playerView } from "@/core/projection/playerView";
import { reducer } from "@/core/reducer/index";
import { createAscensaoEngine } from "@/core/composition";
import { balanceOf } from "@/core/gameEngine";
import { createRng, nextFloat } from "@/core/ports/random";
import type { Difficulty, GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";
import { pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf } from "@/core/state/access";
import { gameOf } from "@/engine/state";

export const engine = createAscensaoEngine();

export const GOLDEN_FORMAT_VERSION = 1;

export interface GoldenSetup {
	readonly heroCardIds: readonly string[];
	readonly difficulty: Difficulty;
	readonly bossCardId: string;
	readonly seed: number;
}

export interface GoldenReplay {
	readonly engineVersion: number;
	readonly name: string;
	readonly seed: number;
	readonly setup: GoldenSetup;
	readonly outcome: string;
	readonly actions: readonly Action[];
	readonly steps: readonly string[];
	readonly finalSnapshot: unknown;
}

export function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_k, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			return Object.fromEntries(
				Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
					a < b ? -1 : a > b ? 1 : 0,
				),
			);
		}
		return v;
	});
}

export function stableView(state: GameState): unknown {
	return JSON.parse(stableStringify(playerView(engine, state)));
}

export function hashView(state: GameState): string {
	return createHash("sha256")
		.update(stableStringify(playerView(engine, state)))
		.digest("hex")
		.slice(0, 16);
}

export function startAction(setup: GoldenSetup): Action {
	return {
		type: "START_GAME",
		payload: {
			heroCardIds: [...setup.heroCardIds],
			difficulty: setup.difficulty,
			bossCardId: setup.bossCardId,
			seed: setup.seed,
			gameId: `golden-${setup.seed}`,
		},
	};
}

export function initialState(setup: GoldenSetup): GameState {
	return createInitialGameState({
		heroCardIds: [...setup.heroCardIds],
		difficulty: setup.difficulty,
	});
}

export function applyAction(state: GameState, action: Action): GameState {
	return reducer(engine, state, action);
}

export function candidates(state: GameState): Action[] {
	const heroes = gameOf(state).heroes.filter((h) => h.status === "active");
	const heroIds = (heroes.length > 0 ? heroes : gameOf(state).heroes).map((h) => h.id);
	const enemies = gameOf(state).activeEnemies.filter((e) => e.status === "active");
	const out: Action[] = [];

	if (pendingTriggerInterruptOf(state)) {
		out.push({
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId: pendingTriggerInterruptOf(state)!.id },
		});
		out.push({
			type: "SKIP_TRIGGER_INTERRUPT",
			payload: { interruptId: pendingTriggerInterruptOf(state)!.id },
		});
		return out;
	}
	if (pendingSkillChoiceOf(state)) {
		for (const o of pendingSkillChoiceOf(state)!.options) {
			out.push({
				type: "SKILL_CHOICE",
				payload: { skillId: pendingSkillChoiceOf(state)!.skillId, choice: o.id },
			});
		}
		return out;
	}
	if (pendingSkillTargetOf(state)) {
		for (const c of pendingSkillTargetOf(state)!.candidates) {
			out.push({
				type: "SELECT_SKILL_TARGET",
				payload: { targetId: c.id },
			});
		}
		out.push({ type: "CANCEL_SKILL_TARGET" });
		return out;
	}

	switch (gameOf(state).status) {
		case "REVEAL_ROOM":
			out.push({ type: "REVEAL_ROOM" });
			break;
		case "ROOM_EFFECT":
			out.push({ type: "RESOLVE_ROOM_EFFECT" });
			break;
		case "SPAWN_ENEMIES":
			out.push({ type: "SPAWN_ENEMIES" });
			break;
		case "COMBAT_START":
			out.push({ type: "START_COMBAT" });
			break;
		case "HERO_ACTION":
			for (const heroId of heroIds) {
				for (const e of enemies) {
					out.push({
						type: "CHOOSE_TARGET",
						payload: { heroId, enemyId: e.id },
					});
				}
			}
			out.push({ type: "CHECK_COMBAT_END" });
			break;
		case "BOSS_COMBAT":
			for (const heroId of heroIds) {
				for (const e of enemies) {
					out.push({
						type: "CHOOSE_TARGET",
						payload: { heroId, enemyId: e.id },
					});
				}
				out.push({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });
			}
			out.push({ type: "START_BOSS_COMBAT" });
			break;
		case "ROLL_DICE":
			out.push({ type: "ROLL_DICE" });
			break;
		case "RESOLVE_ATTACK":
			out.push({ type: "RESOLVE_ATTACK" });
			break;
		case "DIRECT_DAMAGE":
			out.push({ type: "DIRECT_DAMAGE" });
			break;
		case "CHECK_COMBAT_END":
			out.push({ type: "CHECK_COMBAT_END" });
			break;
		case "REWARD_PHASE":
			if (gameOf(state).pendingRewards.length > 0) {
				for (const heroId of heroIds) {
					out.push({
						type: "CHOOSE_ITEM_DESTINATION",
						payload: { heroId, destination: "equip" },
					});
					out.push({
						type: "CHOOSE_ITEM_DESTINATION",
						payload: { heroId, destination: "backpack" },
					});
					out.push({ type: "CHOOSE_ARTIFACT_BEARER", payload: { heroId } });
				}
				out.push({
					type: "CHOOSE_ITEM_DESTINATION",
					payload: { heroId: heroIds[0] ?? "", destination: "discard" },
				});
			}
			out.push({ type: "GRANT_REWARDS" });
			break;
		case "XP_SPEND_PHASE":
			if (gameOf(state).groupXp >= balanceOf(engine).xpCosts.buy_artifact) {
				out.push({ type: "SPEND_XP", payload: { option: "buy_artifact" } });
				break;
			}
			if (gameOf(state).groupXp >= balanceOf(engine).xpCosts.level_up) {
				for (const heroId of heroIds) {
					out.push({
						type: "SPEND_XP",
						payload: { option: "level_up", heroId },
					});
				}
			}
			if (gameOf(state).groupXp >= balanceOf(engine).xpCosts.buy_artifact) {
				out.push({ type: "SPEND_XP", payload: { option: "buy_artifact" } });
			}
			if (gameOf(state).groupXp >= balanceOf(engine).xpCosts.buy_item) {
				out.push({ type: "SPEND_XP", payload: { option: "buy_item" } });
			}
			out.push({ type: "CHECK_BOSS_CONDITION" });
			break;
		case "OPEN_PATHS":
			out.push({ type: "OPEN_PATHS" });
			break;
		case "CHOOSE_PATH":
			for (const cardId of gameOf(state).paths) {
				out.push({ type: "CHOOSE_PATH", payload: { cardId } });
			}
			break;
		case "DISCARD_PATHS":
			out.push({ type: "DISCARD_PATHS" });
			break;
		case "CHECK_BOSS_CONDITION":
			out.push({ type: "CHECK_BOSS_CONDITION" });
			break;
		case "BOSS_REVEAL":
			out.push({ type: "REVEAL_BOSS" });
			break;
		case "DUNGEON_EXHAUSTED":
			out.push({ type: "SPEND_XP", payload: { option: "recover_dungeon" } });
			out.push({ type: "DEFEAT", payload: { reason: "dungeon_exhausted" } });
			break;
		case "DUNGEON_RESTART_PROMPT":
			out.push({ type: "RESTART_DUNGEON", payload: { keepEquipment: true } });
			out.push({ type: "DEFEAT", payload: { reason: "fled" } });
			break;
		default:
			break;
	}
	return out;
}

const FALLBACK_TYPES = new Set([
	"DEFEAT",
	"CANCEL_SKILL_TARGET",
	"SKIP_TRIGGER_INTERRUPT",
	"CHECK_COMBAT_END",
	"CHECK_BOSS_CONDITION",
]);

export function isFallback(action: Action): boolean {
	if (FALLBACK_TYPES.has(action.type)) return true;
	return (
		action.type === "CHOOSE_ITEM_DESTINATION" &&
		action.payload.destination !== "backpack"
	);
}

export const TERMINAL = new Set(["VICTORY", "DEFEAT"]);

export interface PlayResult {
	readonly actions: Action[];
	readonly steps: string[];
	readonly final: GameState;
	readonly visited: Set<string>;
}

export function play(
	setup: GoldenSetup,
	policySeed: number,
	maxSteps: number,
): PlayResult {
	const actions: Action[] = [];
	const steps: string[] = [];
	let rng = createRng(policySeed);
	const start = startAction(setup);
	let state = applyAction(initialState(setup), start);
	actions.push(start);
	steps.push(hashView(state));
	const visited = new Set<string>([gameOf(state).status]);

	while (!TERMINAL.has(gameOf(state).status) && actions.length < maxSteps) {
		const pool = candidates(state);
		let advanced = false;
		const order = [...pool];
		for (let i = order.length - 1; i > 0; i--) {
			const r = nextFloat(rng);
			rng = r.next;
			const j = Math.floor(r.value * (i + 1));
			[order[i], order[j]] = [order[j] as Action, order[i] as Action];
		}
		order.sort((a, b) => Number(isFallback(a)) - Number(isFallback(b)));
		const before = hashView(state);
		for (const action of order) {
			let next: GameState;
			try {
				next = applyAction(state, action);
			} catch {
				continue;
			}
			if (hashView(next) === before) continue;
			state = next;
			actions.push(action);
			steps.push(hashView(state));
			visited.add(gameOf(state).status);
			advanced = true;
			break;
		}
		if (!advanced) break;
	}
	return { actions, steps, final: state, visited };
}

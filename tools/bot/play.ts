import type { Action } from "@/core/actions/types";
import { legalActions } from "@/core/legalActions";
import { createRng, nextFloat } from "@/core/ports/random";
import type { GameState } from "@/core/state/gameState";
import {
	applyAction,
	engine,
	type GoldenSetup,
	hashView,
	initialState,
	isFallback,
	startAction,
} from "../golden/lib";
import {
	type CardCounts,
	checkNoProgress,
	checkState,
	countCards,
	isTerminal,
	type Violation,
} from "./invariants";
import { gameOf } from "@/engine/state";

export const BOT_HEROES = [
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_eternal_rest_cleric",
	"hero_rift_rogue",
	"hero_broken_bastion_warrior",
	"hero_deep_veil_necromancer",
	"hero_crimson_rune_mage",
	"hero_broken_veil_hunter",
];
const BOSS = "boss_azhakar";
const DIFFICULTIES: GoldenSetup["difficulty"][] = [
	"very_easy",
	"easy",
	"normal",
	"hard",
	"nightmare",
];

export interface BotReplay {
	readonly format: 1;
	readonly seed: number;
	readonly setup: GoldenSetup;
	readonly maxSteps: number;
	readonly actions: readonly Action[];
	readonly violation?: Violation;
}

export interface GameResult {
	readonly setup: GoldenSetup;
	readonly actions: Action[];
	readonly final: GameState;
	readonly violation: Violation | null;
}

class Rolls {
	private rng;
	constructor(seed: number) {
		this.rng = createRng(seed);
	}
	next(): number {
		const r = nextFloat(this.rng);
		this.rng = r.next;
		return r.value;
	}
	int(n: number): number {
		return Math.floor(this.next() * n);
	}
}

export function setupFromSeed(seed: number): GoldenSetup {
	const rolls = new Rolls(seed);
	const pool = [...BOT_HEROES];
	const count = 1 + rolls.int(4);
	const heroCardIds: string[] = [];
	for (let i = 0; i < count; i++) {
		heroCardIds.push(pool.splice(rolls.int(pool.length), 1)[0] as string);
	}
	return {
		heroCardIds,
		difficulty: DIFFICULTIES[rolls.int(DIFFICULTIES.length)] as GoldenSetup["difficulty"],
		bossCardId: BOSS,
		seed,
	};
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function onlyWarnings(prev: GameState, next: GameState): boolean {
	const added = gameOf(next).eventLog.slice(gameOf(prev).eventLog.length);
	return (
		added.length > 0 &&
		added.every((line) => line.startsWith("[AVISO]")) &&
		gameOf(next).groupXp === gameOf(prev).groupXp
	);
}

function advances(
	state: GameState,
	action: Action,
	before: string,
): GameState | null {
	const next = applyAction(state, action);
	if (hashView(next) === before) return null;
	if (gameOf(next).status === gameOf(state).status && onlyWarnings(state, next)) return null;
	if (action.type === "SPEND_XP" && gameOf(next).groupXp >= gameOf(state).groupXp) return null;
	return next;
}

export function stuckViolation(state: GameState): Violation {
	const pool = legalActions(engine, state);
	const before = hashView(state);
	const errors: string[] = [];
	for (const action of pool) {
		try {
			if (advances(state, action, before)) {
				return {
					invariant: "no_legal_action",
					message: "algum candidato avança o estado; o bot não o escolheu",
				};
			}
		} catch (e) {
			errors.push(`${action.type}: ${errorMessage(e)}`);
		}
	}
	if (errors.length > 0) {
		return {
			invariant: "dispatch_exception",
			message: `status ${gameOf(state).status}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1})` : ""}`,
		};
	}
	return {
		invariant: "no_legal_action",
		message: `status ${gameOf(state).status} sem action legal que altere o estado (${pool.length} candidatos)`,
	};
}

function shuffled(state: GameState, rolls: Rolls): Action[] {
	const order = legalActions(engine, state);
	for (let i = order.length - 1; i > 0; i--) {
		const j = rolls.int(i + 1);
		[order[i], order[j]] = [order[j] as Action, order[i] as Action];
	}
	return order.sort((a, b) => Number(isFallback(a)) - Number(isFallback(b)));
}

export function playGame(
	setup: GoldenSetup,
	maxSteps: number,
	onStep?: (state: GameState, action: Action) => void,
): GameResult {
	const rolls = new Rolls(setup.seed * 31 + 7);
	const actions: Action[] = [];
	const start = startAction(setup);
	let state: GameState;
	try {
		state = applyAction(initialState(setup), start);
	} catch (e) {
		return {
			setup,
			actions,
			final: initialState(setup),
			violation: {
				invariant: "dispatch_exception",
				message: `START_GAME: ${errorMessage(e)}`,
			},
		};
	}
	actions.push(start);
	const baseline: CardCounts = countCards(state);
	let violation = checkState(state, baseline);

	while (!violation && !isTerminal(state)) {
		if (actions.length >= maxSteps) {
			violation = {
				invariant: "max_steps_exceeded",
				message: `partida não terminou em ${maxSteps} actions (status ${gameOf(state).status}, salas limpas ${gameOf(state).roomsCleared})`,
			};
			break;
		}
		const before = hashView(state);
		let advanced = false;
		for (const action of shuffled(state, rolls)) {
			let next: GameState | null;
			try {
				next = advances(state, action, before);
			} catch {
				continue;
			}
			if (!next) continue;
			state = next;
			actions.push(action);
			onStep?.(state, action);
			advanced = true;
			break;
		}
		if (!advanced) {
			violation = stuckViolation(state);
			break;
		}
		violation =
			checkState(state, baseline) ?? checkNoProgress(actions, state);
	}
	return { setup, actions, final: state, violation };
}

export function replayGame(replay: BotReplay): GameResult {
	const { setup, actions, maxSteps } = replay;
	let state = initialState(setup);
	let baseline: CardCounts = {};
	let violation: Violation | null = null;
	for (let i = 0; i < actions.length && !violation; i++) {
		const action = actions[i] as Action;
		try {
			state = applyAction(state, action);
		} catch (e) {
			violation = {
				invariant: "dispatch_exception",
				message: `${action.type}: ${errorMessage(e)}`,
			};
			break;
		}
		if (i === 0) baseline = countCards(state);
		violation =
			checkState(state, baseline) ??
			checkNoProgress(actions.slice(0, i + 1), state);
	}
	if (!violation && !isTerminal(state)) {
		violation =
			actions.length >= maxSteps
				? {
						invariant: "max_steps_exceeded",
						message: `partida não terminou em ${maxSteps} actions (status ${gameOf(state).status}, salas limpas ${gameOf(state).roomsCleared})`,
					}
				: stuckViolation(state);
	}
	return { setup, actions: [...actions], final: state, violation };
}

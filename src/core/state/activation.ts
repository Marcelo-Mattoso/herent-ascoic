import { removeModifiersAppliedBySource } from "../ecs/world";
import { removeBlocksAppliedBySource } from "./blockHelpers";
import type { GameState } from "./gameState";
import type { GameEngine } from "../gameEngine";

import { withWorld, worldOf } from "./access";
import { gameOf, withGame } from "../../engine/state";
export type ActivationSubjectKind =
	| "hero"
	| "enemy"
	| "boss"
	| "room"
	| "item"
	| "artifact"
	| "card";

export type ActivationScope = string;

export interface ActivationLock {
	readonly kind: ActivationSubjectKind;
	readonly id: string;
	readonly scope: ActivationScope;
	readonly sourceId?: string;
	readonly reason?: string;
}

export type ActivationLocks = Readonly<Record<string, ActivationLock>>;

export class ActivationTracker {
	static key(kind: ActivationSubjectKind, id: string): string {
		return `${kind}:${id}`;
	}

	static isDisabled(
		state: GameState,
		kind: ActivationSubjectKind,
		id: string,
	): boolean {
		const key = ActivationTracker.key(kind, id);
		return Boolean(gameOf(state).combat?.disabled?.[key] ?? gameOf(state).disabled?.[key]);
	}

	static isHeroDisabledThisRound(state: GameState, heroId: string): boolean {
		return (
			ActivationTracker.isDisabled(state, "hero", heroId) ||
			!!gameOf(state).combat?.heroesActed.includes(heroId)
		);
	}

	static hasHeroEffectsDisabled(state: GameState, heroId: string): boolean {
		const hero = gameOf(state).heroes.find((entry) => entry.id === heroId);
		return (
			!hero ||
			hero.status !== "active" ||
			ActivationTracker.isDisabled(state, "hero", heroId)
		);
	}

	/** Marca só o fim da ação da rodada; efeitos ativos continuam válidos. */
	static endHeroTurn(state: GameState, heroId: string): GameState {
		if (!gameOf(state).combat || gameOf(state).combat!.heroesActed.includes(heroId)) return state;
		return withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				heroesActed: [...gameOf(state).combat!.heroesActed, heroId],
			} }));
	}

	static disable(
		engine: GameEngine,
		state: GameState,
		lock: ActivationLock,
	): GameState {
		const scopes = engine.scopes.registry;
		const key = ActivationTracker.key(lock.kind, lock.id);
		scopes.assert(lock.scope);

		let next: GameState;
		if (scopes.isWithin(lock.scope, "combat")) {
			if (!gameOf(state).combat) return state;
			const heroesActed =
				lock.kind === "hero" &&
				!gameOf(state).combat!.heroesActed.includes(lock.id)
					? [...gameOf(state).combat!.heroesActed, lock.id]
					: gameOf(state).combat!.heroesActed;

			next = withGame(state, (prevGame) => ({ ...prevGame, combat: {
					...gameOf(state).combat!,
					heroesActed,
					disabled: { ...(gameOf(state).combat!.disabled ?? {}), [key]: lock },
				} }));
		} else {
			next = withGame(state, (prevGame) => ({ ...prevGame, disabled: { ...(gameOf(state).disabled ?? {}), [key]: lock } }));
		}

		if (lock.kind !== "hero") return next;
		const withoutEffects = withWorld(next, removeModifiersAppliedBySource(worldOf(next), lock.id));
		return removeBlocksAppliedBySource(withoutEffects, lock.id);
	}

	static enable(
		state: GameState,
		kind: ActivationSubjectKind,
		id: string,
	): GameState {
		const key = ActivationTracker.key(kind, id);
		const { [key]: _global, ...disabled } = gameOf(state).disabled ?? {};
		const combatDisabled = gameOf(state).combat
			? (() => {
					const { [key]: _combat, ...remaining } =
						gameOf(state).combat?.disabled ?? {};
					return remaining;
				})()
			: null;

		return withGame(state, (prevGame) => ({ ...prevGame, disabled, combat: gameOf(state).combat && combatDisabled
					? { ...gameOf(state).combat!, disabled: combatDisabled }
					: gameOf(state).combat }));
	}

	static clearScope(state: GameState, scope: ActivationScope): GameState {
		const disabled = ActivationTracker.clearLocks(gameOf(state).disabled ?? {}, scope);
		const combatDisabled = gameOf(state).combat
			? ActivationTracker.clearLocks(gameOf(state).combat!.disabled ?? {}, scope)
			: null;

		return withGame(state, (prevGame) => ({ ...prevGame, disabled, combat: gameOf(state).combat && combatDisabled
					? { ...gameOf(state).combat!, disabled: combatDisabled }
					: gameOf(state).combat }));
	}

	static clearLocks(
		locks: ActivationLocks,
		scope: ActivationScope,
	): ActivationLocks {
		return Object.fromEntries(
			Object.entries(locks).filter(([, lock]) => lock.scope !== scope),
		);
	}

	static disableHeroForRound(
		engine: GameEngine,
		state: GameState,
		heroId: string,
		reason: string,
	): GameState {
		return ActivationTracker.disable(engine, state, {
			kind: "hero",
			id: heroId,
			scope: "round",
			sourceId: heroId,
			reason,
		});
	}
}

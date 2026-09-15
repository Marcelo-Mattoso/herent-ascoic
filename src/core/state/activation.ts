import { removeModifiersAppliedBySource } from "../ecs/world";
import { removeBlocksAppliedBySource } from "./blockHelpers";
import type { GameState } from "./gameState";

export type ActivationSubjectKind =
	| "hero"
	| "enemy"
	| "boss"
	| "room"
	| "item"
	| "artifact"
	| "card";

export type ActivationScope = "round" | "combat" | "room" | "game";

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
		return Boolean(state.combat?.disabled?.[key] ?? state.disabled?.[key]);
	}

	static isHeroDisabledThisRound(state: GameState, heroId: string): boolean {
		return (
			ActivationTracker.isDisabled(state, "hero", heroId) ||
			!!state.combat?.heroesActed.includes(heroId)
		);
	}

	static hasHeroEffectsDisabled(state: GameState, heroId: string): boolean {
		const hero = state.heroes.find((entry) => entry.id === heroId);
		return (
			!hero ||
			hero.status !== "active" ||
			ActivationTracker.isDisabled(state, "hero", heroId)
		);
	}

	/** Marca só o fim da ação da rodada; efeitos ativos continuam válidos. */
	static endHeroTurn(state: GameState, heroId: string): GameState {
		if (!state.combat || state.combat.heroesActed.includes(heroId)) return state;
		return {
			...state,
			combat: {
				...state.combat,
				heroesActed: [...state.combat.heroesActed, heroId],
			},
		};
	}

	static disable(
		state: GameState,
		lock: ActivationLock,
	): GameState {
		const key = ActivationTracker.key(lock.kind, lock.id);

		let next: GameState;
		if (lock.scope === "round" || lock.scope === "combat") {
			if (!state.combat) return state;
			const heroesActed =
				lock.kind === "hero" &&
				!state.combat.heroesActed.includes(lock.id)
					? [...state.combat.heroesActed, lock.id]
					: state.combat.heroesActed;

			next = {
				...state,
				combat: {
					...state.combat,
					heroesActed,
					disabled: { ...(state.combat.disabled ?? {}), [key]: lock },
				},
			};
		} else {
			next = {
				...state,
				disabled: { ...(state.disabled ?? {}), [key]: lock },
			};
		}

		if (lock.kind !== "hero") return next;
		const withoutEffects = {
			...next,
			world: removeModifiersAppliedBySource(next.world, lock.id),
		};
		return removeBlocksAppliedBySource(withoutEffects, lock.id);
	}

	static enable(
		state: GameState,
		kind: ActivationSubjectKind,
		id: string,
	): GameState {
		const key = ActivationTracker.key(kind, id);
		const { [key]: _global, ...disabled } = state.disabled ?? {};
		const combatDisabled = state.combat
			? (() => {
					const { [key]: _combat, ...remaining } =
						state.combat?.disabled ?? {};
					return remaining;
				})()
			: null;

		return {
			...state,
			disabled,
			combat:
				state.combat && combatDisabled
					? { ...state.combat, disabled: combatDisabled }
					: state.combat,
		};
	}

	static clearScope(state: GameState, scope: ActivationScope): GameState {
		const disabled = ActivationTracker.clearLocks(state.disabled ?? {}, scope);
		const combatDisabled = state.combat
			? ActivationTracker.clearLocks(state.combat.disabled ?? {}, scope)
			: null;

		return {
			...state,
			disabled,
			combat:
				state.combat && combatDisabled
					? { ...state.combat, disabled: combatDisabled }
					: state.combat,
		};
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
		state: GameState,
		heroId: string,
		reason: string,
	): GameState {
		return ActivationTracker.disable(state, {
			kind: "hero",
			id: heroId,
			scope: "round",
			sourceId: heroId,
			reason,
		});
	}
}
